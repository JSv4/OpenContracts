import json
import logging
import os

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.agent import (
    FunctionCallingAgentWorker,
    ReActAgent,
    StructuredPlannerAgent,
)
from llama_index.core.tools import FunctionTool, QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

logger = logging.getLogger(__name__)


@shared_task
def oc_llama_index_doc_query(
    cell_id: int, similarity_top_k: int = 8, max_token_length: int = 64000
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

    import marvin
    import numpy as np
    import tiktoken
    from django.conf import settings
    from django.db.models import Q
    from django.utils import timezone
    from llama_index.core import QueryBundle, Settings, VectorStoreIndex
    from llama_index.core.postprocessor import SentenceTransformerRerank
    from llama_index.core.schema import Node, NodeWithScore
    from llama_index.core.tools import QueryEngineTool
    from pgvector.django import CosineDistance
    from pydantic import BaseModel

    from opencontractserver.annotations.models import Annotation, Relationship
    from opencontractserver.extracts.models import Datacell
    from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
    from opencontractserver.utils.embeddings import calculate_embedding_for_text
    from opencontractserver.utils.etl import parse_model_or_primitive

    logger = logging.getLogger(__name__)

    datacell = Datacell.objects.get(id=cell_id)

    try:
        datacell.started = timezone.now()
        datacell.save()

        document = datacell.document

        embed_model = HuggingFaceEmbedding(
            "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
        )  # Using our pre-load cache path where the model was stored on container build
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
        vector_store = DjangoAnnotationVectorStore.from_params(
            document_id=document.id, must_have_text=datacell.column.must_contain_text
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)

        # =====================
        # Structural context
        # =====================
        structural_annotations = Annotation.objects.filter(
            document_id=document.id, structural=True, page=0
        )

        structural_context = (
            "\n".join(
                f"{annot.annotation_label.text if annot.annotation_label else 'Unlabeled'}: {annot.raw_text}"
                for annot in structural_annotations
            )
            if structural_annotations
            else ""
        )

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
                "oc_llama_index_doc_query - Detected special break character in "
                "examples `|||` - splitting and averaging embeddings."
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
                sbert_rerank = SentenceTransformerRerank(
                    model="/models/sentence-transformers/cross-encoder/ms-marco-MiniLM-L-2-v2",
                    top_n=5,
                )
            except (OSError, ValueError) as e:
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
        if len(retrieved_annotation_ids) > 0:
            datacell.sources.add(*retrieved_annotation_ids)

        raw_retrieved_text = "\n".join(
            f"```Relevant Section:\n\n{rn.node.text}\n```" for rn in retrieved_nodes
        )

        # =====================
        # Retrieve relationship where these annotations are source or target
        # =====================
        relationships = (
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

        relationship_sections = []
        if relationships.count() > 0:
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
                rel_type = (
                    rel.relationship_label.text
                    if rel.relationship_label
                    else "relates_to"
                )
                for source in rel.source_annotations.all():
                    for target in rel.target_annotations.all():
                        # Add node definitions if not already added
                        if source.id not in added_nodes:
                            retrieved_marker = (
                                " [↑]" if source.id in retrieved_annotation_ids else ""
                            )
                            source_text = (
                                source.raw_text[:64] + "..."
                                if len(source.raw_text) > 64
                                else source.raw_text
                            )
                            relationship_sections.append(
                                f"Node{source.id}[label: "
                                f'{source.annotation_label.text if source.annotation_label else "unlabeled"}, '
                                f'text: "{source_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(source.id)

                        if target.id not in added_nodes:
                            retrieved_marker = (
                                " [↑]" if target.id in retrieved_annotation_ids else ""
                            )
                            target_text = (
                                target.raw_text[:64] + "..."
                                if len(target.raw_text) > 64
                                else target.raw_text
                            )
                            relationship_sections.append(
                                f"Node{target.id}[label: "
                                f'{target.annotation_label.text if target.annotation_label else "unlabeled"}, '
                                f'text: "{target_text}"{retrieved_marker}]'
                            )
                            added_nodes.add(target.id)

                        # Add relationship
                        relationship_sections.append(
                            f"Node{source.id} -->|{rel_type}| Node{target.id}"
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
                rel_type = (
                    rel.relationship_label.text
                    if rel.relationship_label
                    else "relates_to"
                )
                relationship_sections.append(f"\nRelationship Type: {rel_type}")

                for source in rel.source_annotations.all():
                    for target in rel.target_annotations.all():
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
                        relationship_sections.append(
                            f"• Node{source.id}[label: "
                            f"{source.annotation_label.text if source.annotation_label else 'unlabeled'}, "
                            f'text: "{source.raw_text}"] {retrieved_source}\n  {rel_type}\n  '
                            f"Node{target.id}"
                            f"[label: {target.annotation_label.text if target.annotation_label else 'unlabeled'}, "
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
                f"Context exceeds token limit ({len(tokens)} > {max_token_length}). Attempting to trim sections."
            )

            # 1) Attempt to trim retrieved sections
            if raw_retrieved_text:
                # Use a safer delimiter so we handle variants
                splitted = raw_retrieved_text.split("```Relevant Section:")
                # splitted[0] is text before the first '```Relevant Section:', if any
                while (
                    len(splitted) > 1 and token_length(combined_text) > max_token_length
                ):
                    splitted.pop(0)  # remove earliest "Relevant Section"
                    new_retrieved_text = "```Relevant Section:".join(splitted)
                    sections_text = (
                        "\n========== Retrieved Relevant Sections ==========\n"
                        f"The following sections were identified as most relevant to your query:\n\n"
                        f"{new_retrieved_text}\n"
                        "==========End of Retrieved Sections==========\n"
                    )
                    full_context_parts = [
                        structural_context,
                        sections_text,
                        relationship_context,
                    ]
                    combined_text = "\n\n".join(filter(None, full_context_parts))

            # Re-check after trimming sections
            if token_length(combined_text) > max_token_length:
                logger.warning(
                    "Context still exceeds token limit after trimming retrieved sects. Trimming rels. context."
                )
                # 2) Attempt to remove relationship context entirely if needed
                full_context_parts = [structural_context, sections_text]
                combined_text = "\n\n".join(filter(None, full_context_parts))

                if token_length(combined_text) > max_token_length:
                    # 3) Attempt to partially trim structural context
                    splitted_structural = structural_context.split("\n")
                    while (
                        len(splitted_structural) > 1
                        and token_length(combined_text) > max_token_length
                    ):
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

        # =====================
        # Marvin casting/extraction
        # =====================
        output_type = parse_model_or_primitive(datacell.column.output_type)

        parse_instructions = datacell.column.instructions

        # Optional: definitions from agentic approach
        agent_response_str = None
        if datacell.column.agentic:

            import nest_asyncio

            nest_asyncio.apply()

            # Now build the doc_engine query and incorporate these new tools
            engine = index.as_query_engine(similarity_top_k=similarity_top_k)
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

            page_retriever_tool = FunctionTool.from_defaults(
                fn=lambda aid, ws: annotation_window(document.id, aid, ws),
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

            agentic_response = agent.query(agent_instructions)
            agent_response_str = str(agentic_response)

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

        if datacell.column.extract_is_list:
            logger.info("Extracting list")
            result = marvin.extract(
                final_text_for_marvin,
                target=output_type,
                instructions=parse_instructions if parse_instructions else query,
            )
        else:
            logger.info("Casting to single instance")
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
        import traceback

        logger.error(f"run_extract() - Ran into error: {e}")
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        datacell.stacktrace = (
            f"Error processing: {e}\n\nFull traceback:\n{traceback.format_exc()}"
        )
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
            "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
        )  # Using our pre-load cache path where the model was stored on container build
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            streaming=False,
        )
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
