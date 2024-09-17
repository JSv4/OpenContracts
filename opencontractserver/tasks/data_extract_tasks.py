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

from opencontractserver.annotations.models import Annotation
from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
from opencontractserver.utils.embeddings import calculate_embedding_for_text
from opencontractserver.utils.etl import parse_model_or_primitive

logger = logging.getLogger(__name__)


@shared_task
def oc_llama_index_doc_query(cell_id, similarity_top_k=15, max_token_length: int = 512):
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

            annotation_ids = [
                n.node.extra_info["annotation_id"] for n in retrieved_nodes
            ]

            datacell.sources.add(*annotation_ids)

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

        logger.info(f"Retrieved text: {retrieved_text}")

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

            # TODO - eventually capture section hierarchy as nlm-sherpa does so we can query up a retrieved chunk to
            #  its parent section

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
            f"Related Document:\n```\n{retrieved_text}\n```\n\n" + definitions
        )

        print(f"Resulting data for marvin: {retrieved_text}")

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
