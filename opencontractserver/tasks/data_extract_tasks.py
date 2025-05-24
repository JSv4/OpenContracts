# opencontractserver/tasks/data_extract_tasks.py
import json
import logging
import os

from asgiref.sync import sync_to_async
from celery import shared_task
from django.conf import settings
from django.db import DatabaseError, OperationalError
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.agent import (
    FunctionCallingAgentWorker,
    ReActAgent,
    StructuredPlannerAgent,
)
from llama_index.core.tools import FunctionTool, QueryEngineTool, ToolMetadata
from llama_index.llms.openai import OpenAI

from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.embedders.custom_pipeline_embedding import (
    OpenContractsPipelineEmbedding,
)
from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory
from opencontractserver.llms.types import AgentFramework
from opencontractserver.shared.decorators import async_celery_task

logger = logging.getLogger(__name__)


def _assemble_and_trim_for_token_limit(
    first_page_structural_annots: list[str],
    raw_node_texts: list[str],
    relationship_intro: list[str],
    relationship_mermaid: list[str],
    relationship_detailed: list[str],
    max_token_length: int,
    token_length_func: callable,
    logger: logging.Logger,
) -> str:
    """
    Take several lists that represent different categories of textual context
    (structural annotations, retrieved node text, relationship intros, diagrams,
    and detailed relationships) and iteratively trim them to fit under a specified
    token limit. If it is impossible to get under the token limit (even after removing
    all items from all lists), return None.

    This process trims in the following order:
      1) relationship_detailed
      2) relationship_mermaid
      3) relationship_intro
      4) first_page_structural_annots
      5) raw_node_texts

    Each list is reduced line-by-line (i.e., item-by-item from the end)
    until the token limit is met or the list is exhausted, after which the next
    category is trimmed. If everything must be removed to try to fit, but it still
    exceeds the token limit, return None. Otherwise, return the final combined string,
    including some wrapper headings for clarity and additional instructions about
    each section's purpose, if the section is non-empty.

    Sections that contain IDs or node references (like Node123) are included so
    that the LLM can map those IDs to context found in the mermaid diagram lines
    or the references in the 'retrieved relevant sections'. These unique identifiers
    help cross-reference the relevant relationships and annotation text.

    Args:
        first_page_structural_annots (list[str]): Lines derived from "first page" structural context.
        raw_node_texts (list[str]): Lines from the retrieved node text.
        relationship_intro (list[str]): Introductory lines explaining relationship context.
        relationship_mermaid (list[str]): The mermaid diagram lines describing relationships visually.
        relationship_detailed (list[str]): Detailed relationship lines (more verbose text),
                                           possibly containing unique IDs to track references.
        max_token_length (int): The maximum allowed token count for the assembled context.
        token_length_func (callable): A function that calculates the token length for a given string.
        logger (logging.Logger): Logger used to provide info/warnings/errors about trimming steps.

    Returns:
        Optional[str]: The fully composed text with partial or full context if we fit
                      in the limit, or None if trimming everything is insufficient.
    """

    def build_context_text() -> str:
        """
        Re-assemble the final context string from the (possibly) trimmed lists.
        Only include headings and explanations for sections that remain non-empty.
        """
        sections: list[str] = []

        # Relationship Intro
        if relationship_intro:
            intro_text = (
                "========== Relationship Introduction ==========\n"
                "These lines provide a general introduction to how certain sections or clauses in this "
                "document interconnect. They help explain why the following relationships or diagrams "
                "may be relevant for answering the question.\n"
            )
            sections.append(intro_text + "\n".join(relationship_intro))

        # Relationship Mermaid
        if relationship_mermaid:
            mermaid_text = (
                "========== Relationship Diagram ==========\n"
                "This mermaid diagram shows how the retrieved sections connect to other parts of the document. "
                "Nodes labeled as 'NodeXYZ' reference specific sections of text that might also appear in the "
                "detailed relationships or the retrieved sections below. If a node is marked [↑], it was deemed "
                "directly relevant to the overarching query.\n"
            )
            sections.append(mermaid_text + "\n".join(relationship_mermaid))

        # Relationship Detailed
        if relationship_detailed:
            detailed_text = (
                "========== Detailed Relationship Descriptions ==========\n"
                "Below are line-by-line descriptions of the relationships among key sections. "
                "Identifiers like Node123 link back to the nodes found in the mermaid diagram, "
                "and may coincide with sections appearing in the 'retrieved relevant sections.' "
                "This is particularly useful for mapping which parts of the text reference one another.\n"
            )
            sections.append(detailed_text + "\n".join(relationship_detailed))

        # Structural context
        if first_page_structural_annots:
            structural_heading = (
                "========== Contents of First Page (for intro/context) ==========\n"
                "This excerpt is from the first page of the document, which can provide general context "
                "on the structure or introductory content.\n"
            )
            structural_footer = "\n========== End of First Page ==========\n"
            sections.append(
                structural_heading
                + "\n".join(first_page_structural_annots)
                + structural_footer
            )

        # Retrieved node text
        if raw_node_texts:
            retrieved_heading = (
                "========== Retrieved Relevant Sections ==========\n"
                "These sections were identified as highly relevant to your query. If a node ID "
                "here (e.g., Node123) was also present in the relationship diagram, it indicates "
                "that these sections are linked to one another, or potentially to other sections "
                "of the document.\n"
            )
            retrieved_footer = "\n========== End of Retrieved Sections ==========\n"
            sections.append(
                retrieved_heading + "\n".join(raw_node_texts) + retrieved_footer
            )

        # Join all
        return "\n".join(sections)

    def current_length() -> int:
        """Measure the current token length of our assembled text."""
        return token_length_func(build_context_text())

    def trim_list_in_reverse(target_list: list[str], label: str) -> bool:
        """
        Trim items from the end of 'target_list' one by one until
        our built text is under the token limit or we exhaust 'target_list'.
        Returns True if we have reached or fallen under the limit,
        False if the list is fully cleared and the text remains too long.
        """
        while target_list and current_length() > max_token_length:
            target_list.pop()  # remove last entry
        if current_length() <= max_token_length:
            logger.info(f"Trimming {label} succeeded in fitting under the limit.")
            return True
        else:
            if not target_list:
                logger.warning(f"Entire {label} list removed, still over limit.")
            return False

    # ---------------------------------------------------------------------------
    # 1) Check if we already fit without trimming
    # ---------------------------------------------------------------------------
    if current_length() <= max_token_length:
        return build_context_text()

    logger.warning(
        f"Initial context exceeds token limit ({current_length()} > {max_token_length}). Starting to trim."
    )

    # ---------------------------------------------------------------------------
    # 2) Trim relationship_detailed
    # ---------------------------------------------------------------------------
    if relationship_detailed:
        logger.warning("Trimming relationship_detailed lines first...")
        if trim_list_in_reverse(relationship_detailed, "relationship_detailed"):
            if current_length() <= max_token_length:
                return build_context_text()

    # ---------------------------------------------------------------------------
    # 3) Trim relationship_mermaid
    # ---------------------------------------------------------------------------
    if relationship_mermaid:
        logger.warning("Trimming relationship_mermaid lines next...")
        if trim_list_in_reverse(relationship_mermaid, "relationship_mermaid"):
            if current_length() <= max_token_length:
                return build_context_text()

    # ---------------------------------------------------------------------------
    # 4) Trim relationship_intro
    # ---------------------------------------------------------------------------
    if relationship_intro:
        logger.warning("Trimming relationship_intro lines next...")
        if trim_list_in_reverse(relationship_intro, "relationship_intro"):
            if current_length() <= max_token_length:
                return build_context_text()

    # ---------------------------------------------------------------------------
    # 5) Trim first_page_structural_annots
    # ---------------------------------------------------------------------------
    if first_page_structural_annots:
        logger.warning("Trimming first_page_structural_annots lines next...")
        if trim_list_in_reverse(
            first_page_structural_annots, "first_page_structural_annots"
        ):
            if current_length() <= max_token_length:
                return build_context_text()

    # ---------------------------------------------------------------------------
    # 6) Trim raw_node_texts
    # ---------------------------------------------------------------------------
    if raw_node_texts:
        logger.warning("Trimming raw_node_texts lines next...")
        if trim_list_in_reverse(raw_node_texts, "raw_node_texts"):
            if current_length() <= max_token_length:
                return build_context_text()

    # ---------------------------------------------------------------------------
    # 7) If all are exhausted and still over the limit, return None
    # ---------------------------------------------------------------------------
    logger.error(
        f"Context still exceeds token limit ({current_length()} > {max_token_length}) "
        "after removing all items. Returning None."
    )
    return None


@sync_to_async
def get_annotation_label_text(annotation):
    """
    Safely get the annotation label text from an annotation object.

    Args:
        annotation: The annotation object to get the label text from.

    Returns:
        str: The label text or 'Unlabeled' if no label exists.
    """
    return (
        annotation.annotation_label.text if annotation.annotation_label else "Unlabeled"
    )


@sync_to_async
def get_column_search_params(datacell):
    """
    Safely get the search text and query from a datacell's column.

    Args:
        datacell: The datacell object to get search parameters from.

    Returns:
        tuple: A tuple containing (match_text, query).
    """
    return datacell.column.match_text, datacell.column.query


@sync_to_async
def get_relationship_label_text(relationship):
    """
    Safely get the relationship label text from a relationship object.

    Args:
        relationship: The relationship object to get the label text from.

    Returns:
        str: The label text or 'relates_to' if no label exists.
    """
    return (
        relationship.relationship_label.text
        if relationship.relationship_label
        else "relates_to"
    )


@sync_to_async
def get_column_extraction_params(datacell):
    """
    Safely get the output_type, instructions, and extract_is_list from a datacell's column.

    Args:
        datacell: The datacell object to get extraction parameters from.

    Returns:
        tuple: A tuple containing (output_type, instructions, extract_is_list).
    """
    return (
        datacell.column.output_type,
        datacell.column.instructions,
        datacell.column.extract_is_list,
    )


@async_celery_task()
async def oc_llama_index_doc_query(
    cell_id: int, similarity_top_k: int = 8, max_token_length: int = 64000
) -> None:
    """
    OpenContracts' default LlamaIndex and Marvin-based data-extraction pipeline.
    It retrieves the relevant sections of the document using:
      1. Sentence transformer embeddings
      2. Sentence transformer re-ranking
      3. Additional relationship context
      4. Trimming logic when tokens exceed the allowed length
      5. Agentic definition retrieval (optional)

    After preparing all context in a single combined string, handle scenario where it
    exceeds our maximum token length.

    Args:
        cell_id (int): Primary key of the relevant Datacell to process.
        similarity_top_k (int): Number of top-k relevant nodes to retrieve.
        max_token_length (int): Maximum context token length allowed.

    Returns:
        None
    """

    import logging

    import marvin
    import numpy as np
    import tiktoken
    from asgiref.sync import sync_to_async
    from django.conf import settings
    from django.utils import timezone
    from llama_index.core import QueryBundle, Settings, VectorStoreIndex
    from llama_index.core.postprocessor import SentenceTransformerRerank
    from llama_index.core.schema import Node, NodeWithScore
    from llama_index.core.tools import QueryEngineTool
    from pydantic import BaseModel

    from opencontractserver.utils.embeddings import calculate_embedding_for_text
    from opencontractserver.utils.etl import parse_model_or_primitive

    logger = logging.getLogger(__name__)

    # -------------------------------------------------------------------------
    # 1) Wrap all ORM calls in sync_to_async or do them outside the async code
    # -------------------------------------------------------------------------

    @sync_to_async
    def sync_get_datacell(pk: int):
        logger.info(f"Entering sync_get_datacell with cell_id={pk}")
        try:
            datacell = Datacell.objects.select_related(
                "extract", "column", "document", "creator"
            ).get(pk=pk)
            logger.info(f"Datacell fetched successfully: {datacell.id}")
            return datacell
        except Exception as e:
            import traceback

            stack_trace = traceback.format_exc()
            logger.exception(
                f"Exception in sync_get_datacell for cell_id={pk}: {e}\nFull stacktrace:\n{stack_trace}"
            )
            raise

    @sync_to_async
    def sync_mark_started(dc):
        """
        Marks a Datacell as 'started' and saves it.

        Args:
            dc (Datacell): The Datacell to mark as started.
        """
        dc.started = timezone.now()
        dc.save()

    @sync_to_async
    def sync_mark_completed(dc, data_dict):
        """
        Marks a Datacell as 'completed' storing data_dict and setting a completion timestamp.

        Args:
            dc (Datacell): The Datacell to mark as completed.
            data_dict (dict): Arbitrary dictionary to store in dc.data.
        """
        dc.data = data_dict
        dc.completed = timezone.now()
        dc.save()

    @sync_to_async
    def sync_mark_failed(dc, exc, tb):
        """
        Marks a Datacell as 'failed', storing stacktrace details.

        Args:
            dc (Datacell): The Datacell to mark as failed.
            exc (Exception): The encountered exception.
            tb (str): The traceback string.
        """
        dc.stacktrace = f"Error processing: {exc}\n\nFull traceback:\n{tb}"
        dc.failed = timezone.now()
        dc.save()

    @sync_to_async
    def get_filtered_annotations_with_similarity(
        document_id: int, avg_embedding: list[float], similarity_top_k: int
    ):
        """
        Synchronously fetch annotations ordered by cosine distance and return them as a list.
        This way, the DB interaction is purely in sync code.
        """
        from pgvector.django import CosineDistance

        from opencontractserver.annotations.models import Annotation
        from opencontractserver.documents.models import Document
        from opencontractserver.tasks.embeddings_task import get_embedder

        # Get the document to find its corpus
        document = Document.objects.get(id=document_id)
        corpus_id = None
        embed_dim = 384  # Default dimension

        # Check if the document is part of any corpus and use that corpus's embedder
        corpus_set = document.corpus_set.all()
        if corpus_set.exists():
            # Use the first corpus for now - could be enhanced to handle multiple corpuses
            corpus_id = corpus_set.first().id

            # Get the embedder for the corpus, passing the document's file type
            embedder_class, _ = get_embedder(corpus_id, document.file_type)
            if embedder_class and hasattr(embedder_class, "vector_size"):
                # Get the dimension from the embedder class
                embed_dim = embedder_class.vector_size

        # Determine which embedding field to use based on dimension
        if embed_dim == 384:
            embedding_field, legacy_field = "embeddings__vector_384", "embedding"
        elif embed_dim == 768:
            embedding_field, legacy_field = "embeddings__vector_768", None
        elif embed_dim == 1536:
            embedding_field, legacy_field = "embeddings__vector_1536", None
        elif embed_dim == 3072:
            embedding_field, legacy_field = "embeddings__vector_3072", None
        else:
            # Default to 384 for backward compatibility
            embedding_field, legacy_field = "embeddings__vector_384", "embedding"

        # Try the new embedding model first
        queryset = Annotation.objects.filter(document_id=document_id)
        new_embedding_queryset = queryset.filter(
            **{f"{embedding_field}__isnull": False}
        )

        if new_embedding_queryset.exists():
            # Use the new embedding model
            queryset = (
                new_embedding_queryset.order_by(
                    CosineDistance(embedding_field, avg_embedding)
                )
                .annotate(similarity=CosineDistance(embedding_field, avg_embedding))
                .select_related("annotation_label")
            )[:similarity_top_k]
        elif legacy_field and embed_dim == 384:
            # Fall back to legacy embedding field for 384-dim only
            legacy_queryset = queryset.filter(**{f"{legacy_field}__isnull": False})
            if legacy_queryset.exists():
                queryset = (
                    legacy_queryset.order_by(
                        CosineDistance(legacy_field, avg_embedding)
                    )
                    .annotate(similarity=CosineDistance(legacy_field, avg_embedding))
                    .select_related("annotation_label")
                )[:similarity_top_k]
            else:
                # No embeddings found, return empty list
                return []
        else:
            # No embeddings found, return empty list
            return []

        # Force evaluation by converting to list if you need the actual rows now:
        return list(queryset)

    @sync_to_async
    def fetch_relationships_for_annotations(retrieved_annotation_ids: list[int]):
        """
        Fetches Relationship objects matching the given annotation IDs
        in a purely synchronous context, returning them as a list.
        """
        from django.db.models import Q

        from opencontractserver.annotations.models import Relationship

        queryset = (
            Relationship.objects.filter(
                Q(source_annotations__id__in=retrieved_annotation_ids)
                | Q(target_annotations__id__in=retrieved_annotation_ids)
            )
            .select_related("relationship_label")
            .prefetch_related(
                "source_annotations__annotation_label",
                "target_annotations__annotation_label",
            )
        )

        # Force the database evaluation and return a list
        return list(queryset)

    @sync_to_async
    def get_structural_annotations(document_id: int, page_number: int):
        """
        Fetch annotations that match document_id, structural=True, page=page_number.
        Also select_related('annotation_label') so that we avoid lazy-loading in async.
        Returns annotations as a list.
        """
        from opencontractserver.annotations.models import Annotation

        return list(
            Annotation.objects.filter(
                document_id=document_id, structural=True, page=page_number
            ).select_related(
                "annotation_label"
            )  # preloads annotation_label
        )

    @sync_to_async
    def add_sources_to_datacell(datacell, annotation_ids: list[int]) -> None:
        """
        Given a Datacell object and a list of annotation IDs,
        perform the M2M .add(...) operation on datacell.sources
        in a fully synchronous context.
        """
        if annotation_ids:
            datacell.sources.add(*annotation_ids)

    """
    Actual asynchronous logic for doc querying. This is where
    you can keep your existing LlamaIndex + Marvin code.
    """
    # --------------------------------------------------------------------------------
    # Example: (most of your existing code can be copied in here, minus the old wrapping)
    # --------------------------------------------------------------------------------

    from llama_index.llms.openai import OpenAI

    from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory

    # Retrieve Datacell
    logger.info(f"Starting oc_llama_index_doc_query for cell_id={cell_id}")

    try:
        logger.info("Attempting to fetch Datacell from database")
        datacell = await sync_get_datacell(cell_id)
        logger.info(f"Successfully fetched Datacell: {datacell.id}")
    except (DatabaseError, OperationalError) as e:
        logger.exception(f"Database error fetching Datacell {cell_id}: {e}")
        raise

    try:
        logger.info("Attempting to perform query logic")
        # Mark as started
        await sync_mark_started(datacell)

        document = datacell.document

        # Get corpus_id if the document is in a corpus
        corpus_id = None
        # Default embedder path, can be overridden by corpus preferred_embedder
        embedder_path = settings.PREFERRED_PARSERS.get(
            "text/plain", ""
        )  # Fallback just in case
        corpus_set = await sync_to_async(document.corpus_set.all)()
        if await sync_to_async(corpus_set.exists)():
            corpus = await sync_to_async(corpus_set.first)()
            corpus_id = corpus.id
            if corpus.preferred_embedder:  # Check if preferred_embedder is set
                embedder_path = corpus.preferred_embedder

        embed_model = OpenContractsPipelineEmbedding(
            corpus_id=corpus_id,
            mimetype=document.file_type,
            embedder_path=embedder_path,
        )
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            streaming=False,
        )
        Settings.llm = llm

        # Potentially extremely large structural context -> we can trim if needed later

        # =====================
        # Build or load index
        # =====================
        # Get user_id with sync_to_async to properly resolve the related field
        user_id = await sync_to_async(lambda: document.creator.id)()

        vector_store = UnifiedVectorStoreFactory.create_vector_store(
            framework=AgentFramework.LLAMA_INDEX,
            user_id=document.creator.id,
            document_id=document.id,
            must_have_text=await sync_to_async(
                lambda: datacell.column.must_contain_text
            )(),
        )

        # async_index = await VectorStoreIndex.from_vector_store(vector_store=vector_store, use_async=True)
        base_index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store,
            embed_model=embed_model,
            use_async=False,  # Important: create sync first
        )

        engine = base_index.as_query_engine(
            similarity_top_k=similarity_top_k, streaming=False
        )

        # =====================
        # Structural context
        # =====================
        # structural_annotations = await sync_to_async(Annotation.objects.filter)(
        #     document_id=document.id, structural=True, page=0
        # )
        first_page_structural_text = await get_structural_annotations(document.id, 0)

        # Process annotations with proper async handling
        first_page_structural_annots = []
        for annot in first_page_structural_text if first_page_structural_text else []:
            label_text = await get_annotation_label_text(annot)
            first_page_structural_annots.append(f"{label_text}: {annot.raw_text}")

        structural_context = "\n".join(first_page_structural_annots)

        if structural_context:
            structural_context = (
                "========Contents of First Page (for intro/context)========\n\n"
                f"{structural_context}\n\n"
                "========End of First Page========\n"
            )

        # =====================
        # Searching logic
        # =====================
        # Properly retrieve search parameters with async handling
        search_text, query = await get_column_search_params(datacell)

        if not search_text and not query:
            logger.warning(
                "No search_text or query provided. Skipping retrieval or using fallback."
            )
            await sync_mark_completed(
                datacell,
                {"data": f"Context Exceeded Token Limit of {max_token_length} Tokens"},
            )
            return

        # We store relevant sections in raw_retrieved_text
        raw_retrieved_text = ""

        # If search_text has a special break char, we average embeddings
        if isinstance(search_text, str) and "|||" in search_text:
            logger.info(
                "oc_llama_index_doc_query - Detected special break character in "
                "examples `|||` - splitting and averaging embeddings."
            )
            examples = [ex for ex in search_text.split("|||") if ex.strip()]
            embeddings: list[list[float | int]] = []

            # Get corpus_id if the document is in a corpus
            corpus_id = None
            corpus_set = document.corpus_set.all()
            if corpus_set.exists():
                corpus_id = corpus_set.first().id

            for example in examples:
                # Pass both corpus_id and document file_type
                vector = calculate_embedding_for_text(
                    example, corpus_id=corpus_id, mimetype=document.file_type
                )
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
                queryset = await get_filtered_annotations_with_similarity(
                    document.id, avg_embedding.tolist(), similarity_top_k
                )

                nodes = [
                    NodeWithScore(
                        node=Node(
                            doc_id=str(row.id),
                            text=row.raw_text,
                            embedding=row.embedding.tolist()
                            if hasattr(row, "embedding") and row.embedding is not None
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

            try:
                # TODO - this is NOT preloaded, I don't think.
                sbert_rerank = SentenceTransformerRerank(
                    model="/models/sentence-transformers/cross-encoder/ms-marco-MiniLM-L-2-v2",
                    top_n=5,
                )
            except (OSError, ValueError, TypeError) as e:
                logger.info(
                    "Local model not found, falling back to downloading from HuggingFace Hub: %s",
                    str(e),
                )
                sbert_rerank = SentenceTransformerRerank(
                    model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=5
                )

            retrieved_nodes = sbert_rerank.postprocess_nodes(nodes, QueryBundle(query))
        else:
            # Default retrieval if special char is absent
            retriever = base_index.as_retriever(similarity_top_k=similarity_top_k)
            results = await retriever.aretrieve(search_text if search_text else query)
            sbert_rerank = SentenceTransformerRerank(
                model="cross-encoder/ms-marco-MiniLM-L-2-v2", top_n=5
            )
            logger.info(f"Reranked results: {sbert_rerank}")
            retrieved_nodes = sbert_rerank.postprocess_nodes(
                results, QueryBundle(query)
            )

        retrieved_annotation_ids = [
            n.node.metadata["annotation_id"] for n in retrieved_nodes
        ]
        if len(retrieved_annotation_ids) > 0:
            await add_sources_to_datacell(datacell, retrieved_annotation_ids)
            # datacell.sources.add(*retrieved_annotation_ids)

        raw_node_texts = [
            f"Relevant Section (NODE ID {rn.node.metadata['annotation_id']}): ```{rn.node.get_content()}```\n"
            for rn in retrieved_nodes
        ]
        raw_retrieved_text = "\n".join(raw_node_texts)

        logger.info(f"Retrieved annotation ids: {retrieved_annotation_ids}")
        logger.info(f"Raw retrieved text: {raw_retrieved_text}")

        relationships = await fetch_relationships_for_annotations(
            retrieved_annotation_ids
        )

        # Build separate lists for different categories
        relationship_intro: list[str] = []
        relationship_mermaid: list[str] = []
        relationship_detailed: list[str] = []

        if relationships and len(relationships) > 0:
            # Introductory text
            relationship_intro.append(
                "\n========== Sections Related to Nodes Most Semantically Similar to Query =========="
            )
            relationship_intro.append(
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
            relationship_mermaid.append(
                "\nFirst, here's a visual graph showing these relationships. "
                "Each node represents a section of text, with arrows showing how they're connected. "
                "The text is truncated for readability, but full text is provided below."
            )
            relationship_mermaid.append("\n```mermaid")
            relationship_mermaid.append("graph TD")

            added_nodes = set()

            # Build mermaid diagram
            for rel in relationships:
                rel_type = (
                    rel.relationship_label.text
                    if rel.relationship_label
                    else "relates_to"
                )
                for source in await sync_to_async(rel.source_annotations.all)():
                    for target in rel.target_annotations.all():
                        # Add node definitions if not already added
                        if source.id not in added_nodes:
                            retrieved_source_marker = (
                                " [↑]" if source.id in retrieved_annotation_ids else ""
                            )
                            source_text = (
                                source.raw_text[:64] + "..."
                                if len(source.raw_text) > 64
                                else source.raw_text
                            )
                            relationship_mermaid.append(
                                f"Node{source.id}[label: "
                                f'{source.annotation_label.text if source.annotation_label else "unlabeled"}, '
                                f'text: "{source_text}"{retrieved_source_marker}]'
                            )
                            added_nodes.add(source.id)

                        if target.id not in added_nodes:
                            retrieved_target_marker = (
                                " [↑]" if target.id in retrieved_annotation_ids else ""
                            )
                            target_text = (
                                target.raw_text[:64] + "..."
                                if len(target.raw_text) > 64
                                else target.raw_text
                            )
                            relationship_mermaid.append(
                                f"Node{target.id}[label: "
                                f'{target.annotation_label.text if target.annotation_label else "unlabeled"}, '
                                f'text: "{target_text}"{retrieved_target_marker}]'
                            )
                            added_nodes.add(target.id)

                        # Add relationship
                        relationship_mermaid.append(
                            f"Node{source.id} -->|{rel_type}| Node{target.id}"
                        )

            relationship_mermaid.append("```\n")

            # Detailed textual description
            relationship_detailed.append(
                "\nBelow is a detailed textual description of these same relationships, "
                "including the complete text of each section. This provides the full context "
                "that might be needed to understand the relationships between document parts:"
            )
            relationship_detailed.append("Textual Description of Relationships:")

            for rel in relationships:
                rel_type = await get_relationship_label_text(rel)
                relationship_detailed.append(f"\nRelationship Type: {rel_type}")

                for source in await sync_to_async(rel.source_annotations.all)():
                    for target in await sync_to_async(rel.target_annotations.all)():
                        retrieved_source = (
                            "[↑ Retrieved]"
                            if source.id in retrieved_annotation_ids
                            else ""
                        )
                        retrieved_target = (
                            "[↑ Retrieved]"
                            if target.id in retrieved_annotation_ids
                            else ""
                        )

                        source_label = await get_annotation_label_text(source)
                        target_label = await get_annotation_label_text(target)

                        relationship_detailed.append(
                            f"• Node{source.id}[label: "
                            f"{source_label}, "
                            f'text: "{source.raw_text}"] {retrieved_source}\n  {rel_type}\n  '
                            f"Node{target.id}"
                            f"[label: {target_label}, "
                            f'text: "{target.raw_text}"] {retrieved_target}'
                        )

            relationship_detailed.append(
                "\n==========End of Document Relationship Context==========\n"
            )

            # Combine or skip these parts as needed:
            relationship_sections = (
                relationship_intro + relationship_mermaid + relationship_detailed
            )
            relationship_context = "\n".join(relationship_sections)
        else:
            logger.info(
                f"Relationships is {type(relationships)} with length {len(relationships) if relationships else 0}"
            )
            relationship_context = ""

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

        # Helper function to get token length quickly
        def token_length(text: str) -> int:
            return len(enc.encode(text))

        # combine all retrieved context before marvin/llama_index call:
        combined_text = _assemble_and_trim_for_token_limit(
            first_page_structural_annots,
            raw_node_texts,
            relationship_intro,
            relationship_mermaid,
            relationship_detailed,
            max_token_length=max_token_length,
            token_length_func=token_length,
            logger=logger,
        )

        if combined_text is None:
            # We skip extraction. Save Datacell with "Exceeded" error message and return
            await sync_mark_completed(
                datacell,
                {"data": f"Context Exceeded Token Limit of {max_token_length} Tokens"},
            )
            return

        # =====================
        # Marvin casting/extraction
        # =====================
        (
            output_type_str,
            parse_instructions,
            extract_is_list,
        ) = await get_column_extraction_params(datacell)
        output_type = parse_model_or_primitive(output_type_str)

        # Optional: definitions from agentic approach
        agent_response_str = None
        if datacell.column.agentic:
            logger.info(f"Datacell {datacell.id} is agentic")

            # Now build the doc_engine query and incorporate these new tools
            engine = base_index.as_query_engine(
                similarity_top_k=similarity_top_k, streaming=False
            )
            query_engine_tools = [
                QueryEngineTool.from_defaults(
                    query_engine=engine,
                    name="document_parts",
                    description=(
                        "Provides semantic/hybrid search over this document to find relevant text."
                    ),
                )
            ]

            # Create function tools
            text_search_tool = FunctionTool.from_defaults(
                fn=lambda q: text_search(document.id, q),
                name="text_search",
                description="Searches for text blocks containing provided raw_text in the current document.",
            )

            def page_retriever_wrapper(Aid: int = 0, ws: int = 50):
                return annotation_window(document.id, Aid, ws)

            page_retriever_tool = FunctionTool.from_defaults(
                fn=page_retriever_wrapper,
                name="annotation_window",
                description="Retrieves contextual text around a specified Annotation.",
            )

            worker = FunctionCallingAgentWorker.from_tools(
                [*query_engine_tools, text_search_tool, page_retriever_tool],
                verbose=True,
            )
            agent = StructuredPlannerAgent(
                worker,
                tools=[*query_engine_tools, text_search_tool, page_retriever_tool],
                verbose=True,
            )

            # -------------------------------------------------------------------
            # 3) Revised mission for the agent
            # -------------------------------------------------------------------
            agent_instructions = f"""
You are an expert agent analyzing information in a legal or contractual document.
1. Read the user's question below.
2. Read the relevant extracted and combined context from the document below.
3. Determine whether you have enough information to provide a succinct, accurate answer.
4. IF more context is needed, use the following tools:
- document_parts (for semantic/hybrid retrieval)
- text_search (for substring matches in the doc's structural annotations)
- page_retriever (to get full text from a 0-indexed page).
5. Once your exploration is sufficient, craft a final short answer in plain text with
no exposition, explanation, or other prose.

User's question:
{query if query else search_text}

Context provided (combined_text):
{combined_text}
"""

            agentic_response = await agent.achat(agent_instructions)
            logger.info(f"Agentic response: {agentic_response}")

            agent_response_str = str(agentic_response)
            logger.info(f"Agentic response str: {agent_response_str}")

        # -------------------------------------------------------------------
        # The rest of the pipeline merges the agentic_response with the final text
        # for Marvin-based casting or extraction, shown here as an example.
        # -------------------------------------------------------------------
        final_text_for_marvin = (
            agent_response_str
            if agent_response_str
            else (
                f"In response to this query:\n\n```\n{search_text if search_text else query}\n```\n\n"
                "We found the following most semantically relevant parts of a document:\n"
                f"```\n{combined_text}\n```"
            )
        )

        logger.info(f"Final text for Marvin: {final_text_for_marvin}")

        if extract_is_list:
            logger.info("Extracting list")
            result = marvin.extract(
                final_text_for_marvin,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )
        else:
            logger.info(f"Casting to single instance ({type(final_text_for_marvin)})")
            result = marvin.cast(
                final_text_for_marvin,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )

        logger.debug(f"Result processed from marvin (type: {type(result)}): {result}")

        if issubclass(output_type, BaseModel) or isinstance(result, BaseModel):
            # datacell.data = {"data": result.model_dump()}
            data = {"data": result.model_dump()}
        elif output_type in [str, int, bool, float]:
            # datacell.data = {"data": result}
            data = {"data": result}
        else:
            raise ValueError(f"Unsupported output type: {output_type}")

        await sync_mark_completed(datacell, data)
        # datacell.completed = timezone.now()
        # datacell.save()

        logger.info("Query logic completed successfully")
    except Exception as e:
        logger.exception(f"Error during query logic for Datacell {cell_id}: {e}")
        raise

    try:
        logger.info("Attempting to save Datacell results to database")
        await sync_mark_completed(datacell, data)
        logger.info("Successfully saved Datacell results")
    except (DatabaseError, OperationalError) as e:
        import traceback

        stack_trace = traceback.format_exc()
        logger.exception(
            f"Database error saving Datacell {cell_id}: {e}\nFull stacktrace:\n{stack_trace}"
        )
        raise

    logger.info(f"Completed oc_llama_index_doc_query for cell_id={cell_id}")


@shared_task
def llama_index_react_agent_query(cell_id):
    """
    Use our modern vector store factory with LlamaIndex REACT Agent to retrieve text. This is from our tutorial and does
    NOT structure data. It simply returns the response to your query as text.
    """

    datacell = Datacell.objects.get(id=cell_id)

    try:

        datacell.started = timezone.now()
        datacell.save()

        document = datacell.document

        # Get corpus_id if the document is in a corpus
        corpus_id = None
        # Default embedder path, can be overridden by corpus preferred_embedder
        embedder_path = settings.PREFERRED_PARSERS.get(
            "text/plain", "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
        )  # Fallback just in case
        corpus_set = document.corpus_set.all()
        if corpus_set.exists():
            corpus = corpus_set.first()
            corpus_id = corpus.id
            if corpus.preferred_embedder:  # Check if preferred_embedder is set
                embedder_path = corpus.preferred_embedder

        embed_model = OpenContractsPipelineEmbedding(
            corpus_id=corpus_id,
            mimetype=document.file_type,
            embedder_path=embedder_path,
        )
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            streaming=False,
        )
        Settings.llm = llm

        vector_store = UnifiedVectorStoreFactory.create_vector_store(
            framework=AgentFramework.LLAMA_INDEX,
            user_id=document.creator.id,
            document_id=document.id,
            must_have_text=datacell.column.must_contain_text,
        )
        index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store, use_async=True
        )

        doc_engine = index.as_query_engine(similarity_top_k=10, streaming=False)

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


def text_search(document_id: int, query_str: str) -> str:
    """
    Performs case-insensitive substring search in structural annotations.
    Returns the first 3 results that match.

    Args:
        document_id (int): The ID of the document to query structural Annotations from.
        query_str (str): The search text to look for in structural Annotations.

    Returns:
        str: A string describing up to 3 matched annotation segments.
    """
    from opencontractserver.annotations.models import Annotation

    matches = Annotation.objects.filter(
        document_id=document_id,
        structural=True,
        raw_text__icontains=query_str,
    ).order_by("id")[0:3]

    if not matches.exists():
        return "No structural annotations matched your text_search."

    results = []
    for ann in matches:
        snippet = f"Annotation ID: {ann.id}, Page: {ann.page}, Text: {ann.raw_text}"
        results.append(snippet)

    return "\n".join(results)


def annotation_window(document_id: int, annotation_id: str, window_size: str) -> str:
    """
    Retrieves contextual text around the specified Annotation. Returns up to
    'window_size' words (on each side) of the Annotation text, with a global
    maximum of 1000 words in total.

    Args:
        document_id (int): The ID of the document containing the annotation.
        annotation_id (str): The ID of the Annotation to retrieve context for.
        window_size (str): The number of words to expand on each side (passed as string).

    Returns:
        str: The textual window around the Annotation or an error message.
    """
    from opencontractserver.annotations.models import Annotation
    from opencontractserver.types.dicts import PawlsPagePythonType, TextSpanData

    # Step 1: Parse the window_size argument
    try:
        window_words = int(window_size)
        # Enforce a reasonable upper bound
        window_words = min(window_words, 500)  # 500 on each side => 1000 total
    except ValueError:
        return "Error: Could not parse window_size as an integer."

    # Step 2: Fetch the annotation and its document
    try:
        annotation = Annotation.objects.get(
            id=int(annotation_id), document_id=document_id
        )
    except (Annotation.DoesNotExist, ValueError):
        return f"Error: Annotation [{annotation_id}] not found."

    doc = annotation.document

    # Step 3: Distinguish text/* vs application/pdf
    file_type = doc.file_type
    if not file_type:
        return "Error: Document file_type not specified."

    # Utility for splitting text into words safely
    def split_words_preserve_idx(text_str: str) -> list[tuple[str, int]]:
        """
        Splits text_str into words. Returns a list of (word, starting_char_index)
        pairs so we can rebuild substrings by word count if needed.
        """
        words_and_idxs: list[tuple[str, int]] = []
        idx = 0
        for word in text_str.split():
            # find the occurrence of this word in text_str starting at idx
            pos = text_str.find(word, idx)
            if pos == -1:
                # fallback if something is off
                pos = idx
            words_and_idxs.append((word, pos))
            idx = pos + len(word)
        return words_and_idxs

    try:
        if file_type.startswith("text/"):
            # -------------------------
            # Handle text/* annotation
            # -------------------------
            if not doc.txt_extract_file or not os.path.exists(
                doc.txt_extract_file.path
            ):
                return "Error: Document has no txt_extract_file or path is invalid."

            # Read the entire doc text
            with open(doc.txt_extract_file.path, encoding="utf-8") as f:
                doc_text = f.read()

            # The Annotation.json is presumably a TextSpanData
            anno_json = annotation.json
            if not isinstance(anno_json, dict):
                return "Error: Annotation.json is not a dictionary for text/*."

            # Attempt to parse it as a TextSpanData
            try:
                span_data: TextSpanData = TextSpanData(**anno_json)
            except Exception:
                return "Error: Annotation.json could not be parsed as TextSpanData for text/* document."

            start_idx = span_data["start"]
            end_idx = span_data["end"]

            # Safeguard: clamp indices
            start_idx = max(start_idx, 0)
            end_idx = min(end_idx, len(doc_text))

            # If user wants a word-based window, we can find the nearest word boundaries
            words_with_idx = split_words_preserve_idx(doc_text)

            # Locate word that encloses start_idx, end_idx
            start_word_index = 0
            end_word_index = len(words_with_idx) - 1

            for i, (_, wstart) in enumerate(words_with_idx):
                if wstart <= start_idx:
                    start_word_index = i
                if wstart <= end_idx:
                    end_word_index = i

            # Expand by 'window_words' on each side, but total no more than 1000 words
            total_window = min(
                window_words * 2 + (end_word_index - start_word_index + 1), 1000
            )
            left_expand = min(window_words, start_word_index)
            right_expand = min(window_words, len(words_with_idx) - end_word_index - 1)

            # Recompute if the combined is too large (simple approach)
            def clamp_to_total_window(
                left: int, right: int, center_count: int, total_max: int
            ):
                current_count = left + right + center_count
                if current_count <= total_max:
                    return left, right
                overshoot = current_count - total_max
                left_reduced = min(left, overshoot)
                new_left = left - left_reduced
                overshoot -= left_reduced
                if overshoot > 0:
                    right_reduced = min(right, overshoot)
                    new_right = right - right_reduced
                else:
                    new_right = right
                return new_left, new_right

            center_chunk = end_word_index - start_word_index + 1
            left_expand, right_expand = clamp_to_total_window(
                left_expand, right_expand, center_chunk, 1000
            )

            final_start_word = start_word_index - left_expand
            final_end_word = end_word_index + right_expand

            final_text_start_char = words_with_idx[final_start_word][1]
            final_text_end_char = (
                len(doc_text)
                if final_end_word >= len(words_with_idx) - 1
                else words_with_idx[final_end_word + 1][1]
            )

            return doc_text[final_text_start_char:final_text_end_char].strip()

        elif file_type == "application/pdf":
            # -------------------------
            # Handle PDF annotation
            # -------------------------
            if not doc.pawls_parse_file or not os.path.exists(
                doc.pawls_parse_file.path
            ):
                return "Error: Document has no pawls_parse_file or path is invalid."

            with open(doc.pawls_parse_file.path, encoding="utf-8") as f:
                pawls_pages = json.load(f)

            if not isinstance(pawls_pages, list):
                return "Error: pawls_parse_file is not a list of PawlsPagePythonType."

            anno_json = annotation.json
            if not isinstance(anno_json, dict):
                return "Error: Annotation.json is not a dictionary for PDF."

            from opencontractserver.types.dicts import (
                OpenContractsSinglePageAnnotationType,
            )

            def is_single_page_annotation(data: dict) -> bool:
                return all(k in data for k in ["bounds", "tokensJsons", "rawText"])

            pages_dict: dict[int, OpenContractsSinglePageAnnotationType] = {}
            try:
                if is_single_page_annotation(anno_json):
                    page_index = annotation.page
                    pages_dict[page_index] = OpenContractsSinglePageAnnotationType(
                        **anno_json
                    )
                else:
                    for k, v in anno_json.items():
                        page_index = int(k)
                        pages_dict[page_index] = OpenContractsSinglePageAnnotationType(
                            **v
                        )
            except Exception:
                return (
                    "Error: Annotation.json could not be parsed as single or multi-page "
                    "PDF annotation data."
                )

            result_texts: list[str] = []

            pawls_by_index: dict[int, PawlsPagePythonType] = {}

            for page_obj in pawls_pages:
                try:
                    pg_ind = page_obj["page"]["index"]
                    pawls_by_index[pg_ind] = PawlsPagePythonType(**page_obj)
                except Exception:
                    continue

            def tokens_as_words(page_index: int) -> list[str]:
                page_data = pawls_by_index.get(page_index)
                if not page_data:
                    return []
                tokens_list = page_data["tokens"]
                return [t["text"] for t in tokens_list]

            for pg_ind, anno_data in pages_dict.items():
                all_tokens = tokens_as_words(pg_ind)
                if not all_tokens:
                    continue

                raw_text = anno_data["rawText"].strip() if anno_data["rawText"] else ""
                # We'll find a contiguous chunk in the token list that matches raw_text, or fallback to partial

                # Join tokens with spaces for searching. Then we find raw_text in there.
                joined_tokens_str = " ".join(all_tokens)

                if raw_text and raw_text in joined_tokens_str:
                    start_idx = joined_tokens_str.index(raw_text)
                    # we can reconstruct the word boundaries
                    # but let's do a simpler approach:
                    # skip words up to that position
                    prefix_part = joined_tokens_str[:start_idx]
                    prefix_count = len(prefix_part.strip().split())
                    anno_word_count = len(raw_text.strip().split())
                    start_word_index = prefix_count
                    end_word_index = prefix_count + anno_word_count - 1

                else:
                    # fallback: we will collect tokens from tokensJsons
                    # each "tokensJsons" entry might have an "id" if each token is identified
                    # or we rely on raw_text if we can't match
                    # we'll do a naive approach: assume the annotation covers some subset in tokens
                    # The user might store token indices in tokensJson.
                    # This is out of scope for a short example. We'll just expand all tokens as fallback.
                    start_word_index = 0
                    end_word_index = len(all_tokens) - 1

                left_expand = window_words
                right_expand = window_words
                total_possible = len(all_tokens)

                final_start_word = max(0, start_word_index - left_expand)
                final_end_word = min(total_possible - 1, end_word_index + right_expand)

                # then clamp total to 1000
                # total words = final_end_word - final_start_word + 1
                total_window = final_end_word - final_start_word + 1
                if total_window > 1000:
                    # reduce from both sides if needed (some naive approach)
                    overshoot = total_window - 1000
                    # reduce from left side first
                    reduce_left = min(overshoot, left_expand)
                    final_start_word += reduce_left
                    overshoot -= reduce_left
                    if overshoot > 0:
                        reduce_right = min(overshoot, right_expand)
                        final_end_word -= reduce_right

                snippet = " ".join(all_tokens[final_start_word : final_end_word + 1])
                if snippet.strip():
                    result_texts.append(f"Page {pg_ind} context:\n{snippet}")

            # Combine page-level context
            if not result_texts:
                return (
                    "No tokens found or no matching text for the specified annotation."
                )

            return "\n\n".join(result_texts)

        else:
            return f"Error: Unsupported document file_type: {file_type}"

    except Exception as e:
        return f"Error: Exception encountered while retrieving annotation window: {e}"


def sync_save_datacell(datacell: Datacell) -> None:
    logger.info(f"Entering sync_save_datacell for Datacell id={datacell.id}")
    try:
        datacell.save()
        logger.info(f"Datacell saved successfully: {datacell.id}")
    except Exception as e:
        logger.exception(
            f"Exception in sync_save_datacell for Datacell id={datacell.id}: {e}"
        )
        raise
