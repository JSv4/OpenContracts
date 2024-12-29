import logging

import marvin
import numpy as np
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from llama_index.core import QueryBundle, Settings, VectorStoreIndex
from llama_index.core.agent import (
    FunctionCallingAgentWorker,
    ReActAgent,
    StructuredPlannerAgent,
)
from llama_index.core.postprocessor import SentenceTransformerRerank
from llama_index.core.schema import Node, NodeWithScore
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI
from pgvector.django import CosineDistance
from pydantic import BaseModel
from django.db.models import Q

from opencontractserver.annotations.models import Annotation, Relationship
from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
from opencontractserver.utils.embeddings import calculate_embedding_for_text
from opencontractserver.utils.etl import parse_model_or_primitive

logger = logging.getLogger(__name__)


@shared_task
def oc_llama_index_doc_query(cell_id, similarity_top_k=8, max_token_length: int = 64000):
    """
    OpenContracts' default LlamaIndex and Marvin-based data extract pipeline to run queries specified for a
    particular cell. We use sentence transformer embeddings + sentence transformer re-ranking.
    """

    datacell = Datacell.objects.get(id=cell_id)

    try:

        datacell.started = timezone.now()
        datacell.save()

        document = datacell.document
        embed_model = HuggingFaceEmbedding(
            model_name="multi-qa-MiniLM-L6-cos-v1", cache_folder="/models"
        )  # Using our pre-load cache path where the model was stored on container build
        Settings.embed_model = embed_model

        llm = OpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        Settings.llm = llm

        # First get structural annotations from first page for document context
        structural_annotations = Annotation.objects.filter(
            document_id=document.id,
            structural=True,
            page=0
        )
        
        structural_context = "\n".join([
            f"{annot.annotation_label.text if annot.annotation_label else 'Unlabeled'}: {annot.raw_text}\n"
            for annot in structural_annotations
        ]) if structural_annotations else ""

        structural_context = f"========Contents of First Page (for context)========\n\n{structural_context}\n\n========End of First Page========\n"

        vector_store = DjangoAnnotationVectorStore.from_params(
            document_id=document.id, must_have_text=datacell.column.must_contain_text
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        # search_text
        search_text = datacell.column.match_text

        # query
        query = datacell.column.query

        # Special character
        if isinstance(search_text, str) and "|||" in search_text:

            logger.info(
                "Detected special break character in examples `|||` - splitting and averaging embeddings."
            )

            examples = search_text.split("|||")
            embeddings: list[list[float | int]] = []
            for example in examples:
                vector = calculate_embedding_for_text(example)
                if vector is not None:
                    embeddings.append(calculate_embedding_for_text(example))

            # print(f"Calculate mean for embeddings {embeddings}")

            avg_embedding: np.ndarray = np.mean(embeddings, axis=0)

            # print(f"Averaged embeddings: {avg_embedding}")

            queryset = (
                Annotation.objects.filter(document_id=document.id)
                .order_by(CosineDistance("embedding", avg_embedding.tolist()))
                .annotate(
                    similarity=CosineDistance("embedding", avg_embedding.tolist())
                )
            )[:similarity_top_k]

            nodes = [
                NodeWithScore(
                    node=Node(
                        doc_id=str(row.id),
                        text=row.raw_text,
                        embedding=row.embedding.tolist()
                        if getattr(row, "embedding", None) is not None
                        else [],
                        extra_info={
                            "page": row.page,
                            "bounding_box": row.bounding_box,
                            "annotation_id": row.id,
                            "label": row.annotation_label.text
                            if row.annotation_label
                            else None,
                            "label_id": row.annotation_label.id
                            if row.annotation_label
                            else None,
                        },
                    ),
                    score=row.similarity,
                )
                for row in queryset
            ]

            sbert_rerank = SentenceTransformerRerank(
                model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=5
            )
            retrieved_nodes = sbert_rerank.postprocess_nodes(nodes, QueryBundle(query))

            retrieved_annotation_ids = [
                n.node.extra_info["annotation_id"] for n in retrieved_nodes
            ]

            datacell.sources.add(*retrieved_annotation_ids)

            retrieved_text = "\n".join(
                [
                    f"```Relevant Section:\n\n{node.text}\n```"
                    for node in retrieved_nodes
                ]
            )

        else:
            retriever = index.as_retriever(similarity_top_k=similarity_top_k)

            results = retriever.retrieve(search_text if search_text else query)

            sbert_rerank = SentenceTransformerRerank(
                model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=5
            )
            retrieved_nodes = sbert_rerank.postprocess_nodes(
                results, QueryBundle(query)
            )

            retrieved_annotation_ids = [
                n.node.extra_info["annotation_id"] for n in retrieved_nodes
            ]
            datacell.sources.add(*retrieved_annotation_ids)

            retrieved_text = "\n".join(
                [f"```Relevant Section:\n\n{n.text}\n```" for n in results]
            )

        # Get all relationships where these annotations are source or target
        relationships = Relationship.objects.filter(
            Q(source_annotations__id__in=retrieved_annotation_ids) |
            Q(target_annotations__id__in=retrieved_annotation_ids)
        ).select_related('relationship_label').prefetch_related(
            'source_annotations__annotation_label',
            'target_annotations__annotation_label'
        )

        relationship_sections = []
        if relationships:
            relationship_sections.append("\n========== Sections Related to Nodes Most Semantically Similar to Query ==========")
            relationship_sections.append(
                "The following sections show how the retrieved relevant text is connected to other parts of the document. "
                "This context is crucial because it shows how the text sections that matched your query are semantically "
                "connected to other document sections through explicit relationships. Sections marked with [↑] are the ones "
                "that were retrieved as relevant to your query. Understanding these relationships can help you:\n"
                "1. See how the retrieved sections fit into the broader document context\n"
                "2. Identify related clauses or definitions that might affect interpretation\n"
                "3. Follow reference chains between different parts of the document\n"
            )

            # Mermaid diagram explanation
            relationship_sections.append(
                "\nFirst, here's a visual graph showing these relationships. "
                "Each node represents a section of text, with arrows showing how they're connected. "
                "The text is truncated for readability, but full text is provided below."
            )
            relationship_sections.append("\n```mermaid")
            relationship_sections.append("graph TD")
            
            # Track nodes we've added to avoid duplicates
            added_nodes = set()
            
            for rel in relationships:
                rel_type = rel.relationship_label.text if rel.relationship_label else "relates_to"
                
                for source in rel.source_annotations.all():
                    for target in rel.target_annotations.all():
                        # Add node definitions if not already added
                        if source.id not in added_nodes:
                            retrieved_marker = " [↑]" if source.id in retrieved_annotation_ids else ""
                            source_text = source.raw_text[:64] + "..." if len(source.raw_text) > 64 else source.raw_text
                            relationship_sections.append(
                                f'Node{source.id}[label: {source.annotation_label.text if source.annotation_label else "unlabeled"}, '
                                f'text: "{source_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(source.id)
                            
                        if target.id not in added_nodes:
                            retrieved_marker = " [↑]" if target.id in retrieved_annotation_ids else ""
                            target_text = target.raw_text[:64] + "..." if len(target.raw_text) > 64 else target.raw_text
                            relationship_sections.append(
                                f'Node{target.id}[label: {target.annotation_label.text if target.annotation_label else "unlabeled"}, '
                                f'text: "{target_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(target.id)
                        
                        # Add relationship
                        relationship_sections.append(f'Node{source.id} -->|{rel_type}| Node{target.id}')
            
            relationship_sections.append("```\n")
            
            # Textual description explanation
            relationship_sections.append(
                "\nBelow is a detailed textual description of these same relationships, "
                "including the complete text of each section. This provides the full context "
                "that might be needed to understand the relationships between document parts:"
            )
            relationship_sections.append("Textual Description of Relationships:")
            for rel in relationships:
                rel_type = rel.relationship_label.text if rel.relationship_label else "relates_to"
                relationship_sections.append(f"\nRelationship Type: {rel_type}")
                
                for source in rel.source_annotations.all():
                    for target in rel.target_annotations.all():
                        retrieved_source = "[↑ Retrieved]" if source.id in retrieved_annotation_ids else ""
                        retrieved_target = "[↑ Retrieved]" if target.id in retrieved_annotation_ids else ""
                        
                        relationship_sections.append(
                            f"• Node{source.id}[label: {source.annotation_label.text if source.annotation_label else 'unlabeled'}, "
                            f'text: "{source.raw_text}"] {retrieved_source}\n  {rel_type}\n  '
                            f"Node{target.id}[label: {target.annotation_label.text if target.annotation_label else 'unlabeled'}, "
                            f'text: "{target.raw_text}"] {retrieved_target}'
                        )
            
            relationship_sections.append("\n==========End of Document Relationship Context==========\n")
        
        relationship_context = "\n".join(relationship_sections)

        # Build full context with structural info first
        full_context = []
        if structural_context:
            full_context.append(structural_context)
            
        # Add retrieved text with clear demarcation
        retrieved_text = "\n========== Retrieved Relevant Sections ==========\n"
        retrieved_text += "The following sections were identified as most relevant to your query:\n\n"
        retrieved_text += "\n".join(
            [f"```Relevant Section:\n\n{n.text}\n```" for n in retrieved_nodes]
        )
        retrieved_text += "\n==========End of Retrieved Sections==========\n"
        full_context.append(retrieved_text)
        
        # Add relationship context
        if relationship_context:
            full_context.append(relationship_context)

        # Combine all context
        combined_text = "\n\n".join(full_context)

        # Check token length and trim if needed
        import tiktoken
        enc = tiktoken.encoding_for_model(settings.OPENAI_MODEL)
        tokens = enc.encode(combined_text)
        
        if len(tokens) > max_token_length:
            logger.warning(f"Context exceeds token limit ({len(tokens)} > {max_token_length}). Trimming...")
            # Keep structural and relationship context, trim retrieved text
            sections = retrieved_text.split("```Relevant Section:\n\n")
            while len(tokens) > max_token_length and len(sections) > 1:
                sections.pop(0)  # Remove earliest section
                new_retrieved_text = "```Relevant Section:\n\n".join(sections)
                full_context = [structural_context, new_retrieved_text, relationship_context]
                combined_text = "\n\n".join(filter(None, full_context))
                tokens = enc.encode(combined_text)
            
            if len(tokens) > max_token_length:
                logger.error(f"Context still exceeds token limit ({len(tokens)} > {max_token_length}). Skipping extraction.")
                datacell.data = {"data": "Context Exceeded Token Limit of {max_token_length} Tokens"}
                datacell.completed = timezone.now()
                datacell.save()
                return

        logger.info(f"Final context length: {len(tokens)} tokens")
        
        output_type = parse_model_or_primitive(datacell.column.output_type)
        logger.info(f"Output type: {output_type}")

        parse_instructions = datacell.column.instructions

        # TODO - eventually this can just be pulled from a separate Django vector index where we filter to definitions!
        definitions = ""
        if datacell.column.agentic:
            import nest_asyncio

            nest_asyncio.apply()

            engine = index.as_query_engine(similarity_top_k=similarity_top_k)

            query_engine_tools = [
                QueryEngineTool.from_defaults(
                    query_engine=engine,
                    name="document_parts",
                    description="Let's you use hybrid or vector search over this document to search for specific text "
                    "semantically or using text search.",
                )
            ]

            # create the function calling worker for reasoning
            worker = FunctionCallingAgentWorker.from_tools(
                query_engine_tools, verbose=True
            )

            # wrap the worker in the top-level planner
            agent = StructuredPlannerAgent(
                worker, tools=query_engine_tools, verbose=True
            )

            response = agent.query(
                f"""Please identify all of the defined terms - capitalized terms that are not well-known proper nouns,
                terms that in quotation marks or terms that are clearly definitions in the context of a given sentence,
                 such as blah blah, as used herein - the bros - and find their definitions. Likewise, if you see a
                 section reference, try to retrieve the original section text. You produce an output that looks like
                 this:
                ```

                ### Related sections and definitions ##########

                [defined term name]: definition
                ...

                [section name]: text
                ...

                ```

                Now, given the text to analyze below, please perform the analysis for this original text:
                ```
                {retrieved_text}
                ```
                """
            )
            definitions = str(response)

        retrieved_text = (
            f"In response to this query:\n\n```\n{search_text}\n```\n\n We found the following most "
            "semantically relevant parts of a document, along with related and referenced sections "
            f"highlighted: \n{combined_text}\n\n" + definitions
        )

        logger.info(f"Resulting data for marvin: {retrieved_text}")

        if datacell.column.extract_is_list:
            print("Extract as list!")
            result = marvin.extract(
                retrieved_text,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )
        else:
            print("Extract single instance")
            result = marvin.cast(
                retrieved_text,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )

        print(f"Result processed from marvin: {result}")
        logger.debug(
            f"run_extract() - processing column datacell {datacell.id} for {datacell.document.id}"
        )

        if issubclass(output_type, BaseModel) or isinstance(output_type, BaseModel):
            datacell.data = {"data": result.model_dump()}
        elif output_type in [str, int, bool, float]:
            datacell.data = {"data": result}
        else:
            raise ValueError(f"Unsupported output type: {output_type}")
        datacell.completed = timezone.now()
        datacell.save()

    except Exception as e:
        logger.error(f"run_extract() - Ran into error: {e}")
        datacell.stacktrace = f"Error processing: {e}"
        datacell.failed = timezone.now()
        datacell.save()


@shared_task
def llama_index_react_agent_query(cell_id):
    """
    Use our DjangoAnnotationVectorStore + LlamaIndex REACT Agent to retrieve text. This is from our tutorial and does
    NOT structure data. It simply returns the response to your query as text.
    """

    datacell = Datacell.objects.get(id=cell_id)

    try:

        datacell.started = timezone.now()
        datacell.save()

        document = datacell.document
        embed_model = HuggingFaceEmbedding(
            model_name="multi-qa-MiniLM-L6-cos-v1", cache_folder="/models"
        )  # Using our pre-load cache path where the model was stored on container build
        Settings.embed_model = embed_model

        llm = OpenAI(model=settings.OPENAI_MODEL, api_key=settings.OPENAI_API_KEY)
        Settings.llm = llm

        vector_store = DjangoAnnotationVectorStore.from_params(
            document_id=document.id, must_have_text=datacell.column.must_contain_text
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        doc_engine = index.as_query_engine(similarity_top_k=10)

        query_engine_tools = [
            QueryEngineTool(
                query_engine=doc_engine,
                metadata=ToolMetadata(
                    name="doc_engine",
                    description=(
                        f"Provides detailed annotations and text from within the {document.title}"
                    ),
                ),
            )
        ]

        agent = ReActAgent.from_tools(
            query_engine_tools,
            llm=llm,
            verbose=True,
        )

        response = agent.chat(datacell.column.query)
        datacell.data = {"data": str(response)}
        datacell.completed = timezone.now()
        datacell.save()

    except Exception as e:
        logger.error(f"run_extract() - Ran into error: {e}")
        datacell.stacktrace = f"Error processing: {e}"
        datacell.failed = timezone.now()
        datacell.save()
