import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.agent import (
    ReActAgent,
)
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

logger = logging.getLogger(__name__)

@shared_task
def oc_llama_index_doc_query(
    cell_id: int,
    similarity_top_k: int = 8,
    max_token_length: int = 64000
) -> None:
    """
    OpenContracts' default LlamaIndex and Marvin-based data-extraction pipeline.
    It retrieves the relevant sections of the document using:
      1. Sentence transformer embeddings
      2. Sentence transformer re-ranking
      3. Additional relationship context
      4. Trimming logic when tokens exceed allowed length
      5. Agentic definition retrieval (optional)

    This refactoring incorporates:
      - Elimination of redundant embedding calls
      - Trimming relationship context if total tokens still exceed the limit
      - More explicit variable naming
      - Safer string splitting for retrieved sections
      - Logging and handling for empty search_text or query
      - Potential trimming of structural annotations if extremely large

    Args:
        cell_id (int): Primary key of the relevant Datacell to process.
        similarity_top_k (int): Number of top-k relevant nodes to retrieve.
        max_token_length (int): Maximum context token length allowed.

    Returns:
        None
    """

    import logging
    import numpy as np
    from django.db.models import Q
    from django.utils import timezone
    from llama_index.core import QueryBundle, Settings, VectorStoreIndex
    from llama_index.core.agent import (
        FunctionCallingAgentWorker,
        StructuredPlannerAgent
    )
    from llama_index.core.postprocessor import SentenceTransformerRerank
    from llama_index.core.schema import Node, NodeWithScore
    from llama_index.core.tools import QueryEngineTool
    from pydantic import BaseModel

    from opencontractserver.annotations.models import Annotation, Relationship
    from opencontractserver.extracts.models import Datacell
    from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
    from opencontractserver.utils.embeddings import calculate_embedding_for_text
    from opencontractserver.utils.etl import parse_model_or_primitive
    from pgvector.django import CosineDistance
    from django.conf import settings
    import marvin
    import tiktoken

    logger = logging.getLogger(__name__)

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

        # Potentially extremely large structural context -> we can trim if needed later

        # =====================
        # Build or load index
        # =====================
        vector_store = DjangoAnnotationVectorStore.from_params(
            document_id=document.id, must_have_text=datacell.column.must_contain_text
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        
        # =====================
        # Structural context
        # =====================
        structural_annotations = Annotation.objects.filter(
            document_id=document.id,
            structural=True,
            page=0
        )
        logger.info(f"oc_llama_index_doc_query - Retrieved {len(structural_annotations)} structural annotations on page 0")
        
        logger.info(f"oc_llama_index_doc_query - Retrieved {len(structural_annotations)} structural annotations on page 0")
        structural_context = "\n".join(
            f"{annot.annotation_label.text if annot.annotation_label else 'Unlabeled'}: {annot.raw_text}"
            for annot in structural_annotations
        ) if structural_annotations else ""

        if structural_context:
            structural_context = (
                "========Contents of First Page (for intro/context)========\n\n"
                f"{structural_context}\n\n"
                "========End of First Page========\n"
            )


        # =====================
        # Searching logic
        # =====================
        search_text = datacell.column.match_text
        query = datacell.column.query

        if not search_text and not query:
            logger.warning(
                "No search_text or query provided. Skipping retrieval or using fallback."
            )
            datacell.data = {
                "data": f"Context Exceeded Token Limit of {max_token_length} Tokens"
            }
            datacell.completed = timezone.now()
            datacell.save()

        # We store relevant sections in raw_retrieved_text
        raw_retrieved_text = ""

        # If search_text has a special break char, we average embeddings
        if isinstance(search_text, str) and "|||" in search_text:
            logger.info(
                "oc_llama_index_doc_query - Detected special break character in examples `|||` - splitting and averaging embeddings."
            )
            examples = [ex for ex in search_text.split("|||") if ex.strip()]
            embeddings: list[list[float | int]] = []

            for example in examples:
                vector = calculate_embedding_for_text(example)
                if vector is not None:
                    embeddings.append(vector)

            if len(embeddings) == 0:
                logger.warning(
                    "oc_llama_index_doc_query - No non-empty text found while splitting `|||`. "
                    "Proceeding with no retrieved sections."
                )
                nodes = []
            else:
                avg_embedding: np.ndarray = np.mean(embeddings, axis=0)
                queryset = (
                    Annotation.objects.filter(document_id=document.id)
                    .order_by(CosineDistance("embedding", avg_embedding.tolist()))
                    .annotate(similarity=CosineDistance("embedding", avg_embedding.tolist()))
                )[:similarity_top_k]

                nodes = [
                    NodeWithScore(
                        node=Node(
                            doc_id=str(row.id),
                            text=row.raw_text,
                            embedding=row.embedding.tolist() if getattr(row, "embedding", None) else [],
                            extra_info={
                                "page": row.page,
                                "bounding_box": row.bounding_box,
                                "annotation_id": row.id,
                                "label": row.annotation_label.text if row.annotation_label else None,
                                "label_id": row.annotation_label.id if row.annotation_label else None,
                            },
                        ),
                        score=row.similarity,
                    )
                    for row in queryset
                ]

            sbert_rerank = SentenceTransformerRerank(
                model="cross-encoder/ms-marco-MiniLM-L-2-v2",
                top_n=5
            )
            retrieved_nodes = sbert_rerank.postprocess_nodes(nodes, QueryBundle(query))
        else:
            # Default retrieval if special char is absent
            retriever = index.as_retriever(similarity_top_k=similarity_top_k)
            results = retriever.retrieve(search_text if search_text else query)
            sbert_rerank = SentenceTransformerRerank(
                model="cross-encoder/ms-marco-MiniLM-L-2-v2",
                top_n=5
            )
            retrieved_nodes = sbert_rerank.postprocess_nodes(
                results,
                QueryBundle(query)
            )
        
        logger.info(f"Retrieved {len(retrieved_nodes)} nodes")

        retrieved_annotation_ids = [
            n.node.extra_info["annotation_id"] for n in retrieved_nodes
        ]
        if retrieved_annotation_ids:
            datacell.sources.add(*retrieved_annotation_ids)

        raw_retrieved_text = "\n".join(
            f"```Relevant Section:\n\n{rn.node.text}\n```" for rn in retrieved_nodes
        )

        # =====================
        # Retrieve relationship where these annotations are source or target
        # =====================
        from django.db.models import Q
        relationships = Relationship.objects.filter(
            Q(source_annotations__id__in=retrieved_annotation_ids)
            | Q(target_annotations__id__in=retrieved_annotation_ids)
        ).select_related('relationship_label').prefetch_related(
            'source_annotations__annotation_label',
            'target_annotations__annotation_label'
        )
        
        logger.info(f"Retrieved {len(relationships)} relationships")

        relationship_sections = []
        if relationships:
            relationship_sections.append(
                "\n========== Sections Related to Nodes Most Semantically Similar to Query =========="
            )
            relationship_sections.append(
                "The following sections show how the retrieved relevant text is connected to other parts "
                "of the document. This context is crucial because it shows how the text sections that matched "
                "your query are semantically connected to other document sections through explicit relationships. "
                "Sections marked with [↑] are the ones that were retrieved as relevant to your query. "
                "Understanding these relationships can help you:\n"
                "1. See how the retrieved sections fit into the broader document context\n"
                "2. Identify related clauses or definitions that might affect interpretation\n"
                "3. Follow reference chains between different parts of the document\n"
            )

            # Mermaid diagram
            relationship_sections.append(
                "\nFirst, here's a visual graph showing these relationships. "
                "Each node represents a section of text, with arrows showing how they're connected. "
                "The text is truncated for readability, but full text is provided below."
            )
            relationship_sections.append("\n```mermaid")
            relationship_sections.append("graph TD")

            added_nodes = set()

            for rel in relationships:
                rel_type = rel.relationship_label.text if rel.relationship_label else "relates_to"
                for source in rel.source_annotations.all():
                    for target in rel.target_annotations.all():
                        # Add node definitions if not already added
                        if source.id not in added_nodes:
                            retrieved_marker = " [↑]" if source.id in retrieved_annotation_ids else ""
                            source_text = (
                                source.raw_text[:64] + "..."
                                if len(source.raw_text) > 64 else source.raw_text
                            )
                            relationship_sections.append(
                                f'Node{source.id}[label: '
                                f'{source.annotation_label.text if source.annotation_label else "unlabeled"}, '
                                f'text: "{source_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(source.id)

                        if target.id not in added_nodes:
                            retrieved_marker = " [↑]" if target.id in retrieved_annotation_ids else ""
                            target_text = (
                                target.raw_text[:64] + "..."
                                if len(target.raw_text) > 64 else target.raw_text
                            )
                            relationship_sections.append(
                                f'Node{target.id}[label: '
                                f'{target.annotation_label.text if target.annotation_label else "unlabeled"}, '
                                f'text: "{target_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(target.id)

                        # Add relationship
                        relationship_sections.append(
                            f'Node{source.id} -->|{rel_type}| Node{target.id}'
                        )

            relationship_sections.append("```\n")

            # Detailed textual description
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

            relationship_sections.append(
                "\n==========End of Document Relationship Context==========\n"
            )

        relationship_context = "\n".join(relationship_sections)

        # =====================
        # Build full context
        # =====================
        # We'll combine structural context, the retrieved sections, and the relationship context
        # into a final "combined_text". Then we trim if needed in steps.
        # We also rename variables to avoid confusion.
        sections_text = (
            "\n========== Retrieved Relevant Sections ==========\n"
            "The following sections were identified as most relevant to your query:\n\n"
            f"{raw_retrieved_text}\n"
            "==========End of Retrieved Sections==========\n"
        )

        full_context_parts = [structural_context, sections_text, relationship_context]
        combined_text = "\n\n".join(filter(None, full_context_parts))

        enc = tiktoken.encoding_for_model(settings.OPENAI_MODEL)
        tokens = enc.encode(combined_text)

        # Helper function to get token length quickly
        def token_length(text: str) -> int:
            return len(enc.encode(text))

        # Trim logic if tokens exceed limit
        if len(tokens) > max_token_length:
            logger.warning(
                f"Context exceeds token limit ({len(tokens)} > {max_token_length}). Attempting to trim retrieved sections..."
            )

            # 1) Attempt to trim retrieved sections
            if raw_retrieved_text:
                # Use a safer delimiter so we handle variants
                splitted = raw_retrieved_text.split("```Relevant Section:")
                # splitted[0] is text before the first '```Relevant Section:', if any
                while len(splitted) > 1 and token_length(combined_text) > max_token_length:
                    splitted.pop(0)  # remove earliest "Relevant Section"
                    new_retrieved_text = "```Relevant Section:".join(splitted)
                    sections_text = (
                        "\n========== Retrieved Relevant Sections ==========\n"
                        f"The following sections were identified as most relevant to your query:\n\n"
                        f"{new_retrieved_text}\n"
                        "==========End of Retrieved Sections==========\n"
                    )
                    full_context_parts = [structural_context, sections_text, relationship_context]
                    combined_text = "\n\n".join(filter(None, full_context_parts))

            # Re-check after trimming sections
            if token_length(combined_text) > max_token_length:
                logger.warning(
                    f"Context still exceeds token limit after trimming retrieved sections. Trimming relationship context..."
                )
                # 2) Attempt to remove relationship context entirely if needed
                full_context_parts = [structural_context, sections_text]
                combined_text = "\n\n".join(filter(None, full_context_parts))

                if token_length(combined_text) > max_token_length:
                    # 3) Attempt to partially trim structural context
                    splitted_structural = structural_context.split("\n")
                    while len(splitted_structural) > 1 and token_length(combined_text) > max_token_length:
                        splitted_structural.pop()
                        new_structural_content = "\n".join(splitted_structural)
                        full_context_parts = [new_structural_content, sections_text]
                        combined_text = "\n\n".join(filter(None, full_context_parts))

                    # If all else fails, skip extraction
                    if token_length(combined_text) > max_token_length:
                        logger.error(
                            f"Context still exceeds token limit ({token_length(combined_text)} > {max_token_length}). "
                            "Skipping extraction."
                        )
                        datacell.data = {
                            "data": f"Context Exceeded Token Limit of {max_token_length} Tokens"
                        }
                        datacell.completed = timezone.now()
                        datacell.save()
                        return

        logger.info(f"Final context length: {token_length(combined_text)} tokens")

        # =====================
        # Marvin casting/extraction
        # =====================
        output_type = parse_model_or_primitive(datacell.column.output_type)
        logger.info(f"Output type: {output_type}")

        parse_instructions = datacell.column.instructions

        # Optional: definitions from agentic approach
        definitions = ""
        if datacell.column.agentic:
            import nest_asyncio
            nest_asyncio.apply()

            engine = index.as_query_engine(similarity_top_k=similarity_top_k)
            query_engine_tools = [
                QueryEngineTool.from_defaults(
                    query_engine=engine,
                    name="document_parts",
                    description=(
                        "Let's you use hybrid or vector search over this document to search for specific text "
                        "semantically or using text search."
                    ),
                )
            ]

            from llama_index.core.agent import FunctionCallingAgentWorker, StructuredPlannerAgent

            worker = FunctionCallingAgentWorker.from_tools(
                query_engine_tools, verbose=True
            )
            agent = StructuredPlannerAgent(
                worker, tools=query_engine_tools, verbose=True
            )
            response = agent.query(
                f"""Please identify all of the defined terms - capitalized terms that are not well-known
                proper nouns, terms in quotation marks, or terms that are clearly definitions in context.
                Likewise, if you see a section reference, retrieve the original text. Output format:
                ```
                ### Related sections and definitions ##########

                [defined term name]: definition
                ...

                [section name]: text
                ...
                ```
                Now, given the text below, perform the analysis:
                ```
                {sections_text}
                ```
                """
            )
            definitions = str(response)

        final_text_for_marvin = (
            f"In response to this query:\n\n```\n{search_text if search_text else query}\n```\n\n"
            "We found the following most semantically relevant parts of a document, "
            "along with related and referenced sections highlighted:\n"
            f"```\n{combined_text}\n```\n\n"
            + definitions
        )

        logger.info(f"Resulting data for marvin: {final_text_for_marvin}")

        if datacell.column.extract_is_list:
            logger.debug("Extract as list!")
            result = marvin.extract(
                final_text_for_marvin,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )
        else:
            logger.debug("Extract single instance")
            result = marvin.cast(
                final_text_for_marvin,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )

        logger.debug(f"Result processed from marvin: {result}")

        if issubclass(output_type, BaseModel) or isinstance(result, BaseModel):
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
