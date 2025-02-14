import logging
import json

import marvin
from django.conf import settings
from asgiref.sync import async_to_sync
from typing import Any, Tuple, List

from opencontractserver.pipeline.utils import get_preferred_embedder
from opencontractserver.shared.decorators import doc_analyzer_task, async_doc_analyzer_task
from opencontractserver.types.dicts import TextSpan
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents import create_document_agent

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY

logger = logging.getLogger(__name__)


@doc_analyzer_task()
def contract_not_contract(*args, pdf_text_extract, **kawrgs):
    """
    Uses marvin and gpt 4o to triage contracts vs not contracts.
    """
    print("Contract not contract")
    category = marvin.classify(
        f"INTRODUCTION:\n`{pdf_text_extract[:1000]}`\nCONCLUSION:\n\n`{pdf_text_extract[-1000:]}`",
        instructions="You determine what type of document we're likely looking at based on the introduction and "
        "conclusion - a contract template, a contract, presentation, other",
        labels=["CONTRACT", "CONTRACT TEMPLATE", "PRESENTATION", "OTHER"],
    )

    return [category], [], [], True


@doc_analyzer_task(
    input_schema={
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "InputSchema",
        "type": "object",
        "properties": {
            "context": {
                "type": "string",
                "title": "Context",
                "description": "A description or context for the input.",
            },
            "labels": {
                "type": "array",
                "title": "Labels",
                "description": "An optional list of labels.",
                "items": {"type": "string"},
                "uniqueItems": True,
            },
        },
        "required": ["context"],
        "additionalProperties": False,
    }
)
def legal_entity_tagger(*args, pdf_text_extract, **kawrgs):
    """
    Use SALI tags plus GLINER plus SPACY sentence splitter to tag legal entities.
    """
    import spacy
    from gliner import GLiNER
    
    print(f"HOHOHO - 🎄❄️: {kawrgs}")

    nlp = spacy.load("en_core_web_lg")

    model = GLiNER.from_pretrained("urchade/gliner_base")
    model.set_sampling_params(
        max_types=25,  # maximum number of entity types during training
        shuffle_types=True,  # if shuffle or not entity types
        random_drop=True,  # randomly drop entity types
        max_neg_type_ratio=1,  # ratio of positive/negative types, 1 mean 50%/50%, 2 mean 33%/66%, 3 mean 25%/75% ...
        max_len=2500,  # maximum sentence length
    )

    labels = [
        "Legal Entity",
        "Entity",
        "Business Trust",
        "Cooperative",
        "Corporation",
        "B Corporation",
        "C Corporation",
        "S Corporation",
        "Exempted Company",
        "Governmental Entity",
        "Limited Duration Company",
        "Limited Liability Company",
        "Municipal Corporation",
        "Non-Governmental Organization",
        "Non-Profit Organization",
        "Partnership",
        "Exempted Limited Partnership",
        "General Partnership",
        "Limited Liability Partnership",
        "Limited Partnership",
        "Political Party",
        "Professional Limited Liability Company",
        "Segregated Portfolio Company",
        "Société Anonyme",
        "Société en Commandite Simple",
        "Société à Responsabilité Limitée",
        "Sole Proprietorship",
        "Sovereign State",
        "Trade Union / Labor Union",
        "Entity Groups",
        "Board of Directors",
        "Class",
        "Committees",
        "Ad Hoc/Unofficial Committee",
        "Creditors' Committee",
        "Independent Committee",
        "Official Committee of Creditors",
        "Official Committee of Unsecured Creditors",
        "Joint Defense Group",
        "Joint Defense Group Member",
    ]

    sentences = [i for i in nlp(pdf_text_extract).sents]
    results = []

    for index, sent in enumerate(sentences):
        ents = model.predict_entities(sent.text, labels)
        for e in ents:
            # Rough heuristic - drop anything with score of less than .7. Anecdotally, anything much lower is garbage.
            if e["score"] > 0.7:
                # print(f"Found Entity with suitable score: {e}")
                span = TextSpan(
                    id=str(index),
                    start=sent.start_char + e["start"],
                    end=sent.start_char + e["end"],
                    text=e["text"],
                )
                # print(f"Mapped to span: {span}")
                results.append(
                    (
                        span,
                        str(e["label"]),
                    )
                )
                # print(f"Expected text: {pdf_text_extract[span['start']:span['end']]}")

    return [], results, [], True


@doc_analyzer_task()
def proper_name_tagger(*args, pdf_text_extract, **kawrgs):
    """
    Use Spacy to tag named entities for organizations, geopolitical entities, people and products.
    """

    import spacy

    nlp = spacy.load("en_core_web_sm")
    doc = nlp(pdf_text_extract)

    results = []

    for index, ent in enumerate(
        [ent for ent in doc.ents if ent.label_ in ["ORG", "GPE", "PERSON", "PRODUCT"]]
    ):
        results.append(
            (
                TextSpan(
                    id=str(index),
                    start=ent.start_char,
                    end=ent.end_char,
                    text="First ten",
                ),
                str(ent.label_),
            )
        )
        # print(ent.text, ent.start_char, ent.end_char, ent.label_)

    # This generates a TON of labels... so artificially limiting to 10 for now... Ideal fix here is using page aware
    # annotations, which I know I was using before for virtual loading. Think it ran into some issues with the jump
    # to annotation functionality, but that should be largely solved with new functionality to render specified annots
    # on annotator load.
    return [], results[:10], [], True


# TODO - more robust, more production-grade approach to knowlege base building
@doc_analyzer_task()
def build_contract_knowledge_base(*args, pdf_text_extract, **kwargs):
    """
    Build a knowledge base from the document.
    """

    from django.core.files.base import ContentFile
    from llama_index.core.llms import ChatMessage
    from llama_index.llms.openai import OpenAI

    from opencontractserver.annotations.models import Note
    from opencontractserver.documents.models import Document

    corpus_id = kwargs.get("corpus_id", None)
    if not corpus_id:
        logger.error("corpus_id is required for build_knowledge_base task")
        return [], [], [], False

    llm = OpenAI(
        model="gpt-4o-mini",  # using the "mini" version as specified
        api_key=settings.OPENAI_API_KEY,  # optional, pulls from env var by default
    )

    doc_id = kwargs.get("doc_id", None)
    if not doc_id:
        logger.error("doc_id is required for build_knowledge_base task")
        return [], [], [], False

    def get_markdown_response(system_prompt: str, user_prompt: str) -> str | None:
        """
        Creates a conversation with given system and user prompts and returns
        the LLM's response in Markdown format.

        :param system_prompt: The content for the system role.
        :param user_prompt: The content for the user role.
        :return: The assistant's response as a string.
        """
        messages: list[ChatMessage] = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_prompt),
        ]
        response = llm.chat(messages)
        return response.message.content

    def prompt_1_single_pass(pdf_text: str) -> str:
        system_prompt = (
            "You are a highly skilled paralegal specializing in contract analysis. "
            "Your goal is to carefully read the contract and produce a detailed yet "
            "concise summary. Strictly follow the requested format and level of detail. "
            "You write in elegant and expressive markdown."
        )

        user_prompt = f"""\
    **Please analyze the following contract** (included below) **and provide the following information:**

    1. **Context and Purpose**
    - A brief description (2–3 sentences) explaining the primary purpose of the contract and any relevant
      background details.

    2. **Knowledge Base Article Summary**
    - **Parties Involved**: Identify all parties and their roles or obligations.
    - **Key Dates**: Outline important dates (e.g., effective date, milestones, deadlines, renewal dates).
    - **Key Definitions**: Lisst or paraphrase any critical definitions that shape the agreement.
    - **Termination & Renewal Provisions**: Summarize any clauses that address how and when the contract
      can end or renew.

    3. **Notes on Referenced Documents & Regulations**
    - **Referenced Documents**: List names and any critical details (e.g., date, version, or relevant
      sections).
    - **Referenced Rules/Regulations**: List any laws, statutes, or regulatory bodies referenced,
      along with a short description of how they apply.

    **Contract Text:**
    {pdf_text}
    """
        return get_markdown_response(system_prompt, user_prompt)

    def prompt_4_references(pdf_text: str) -> str:
        system_prompt = (
            "You are acting as a senior legal assistant. Your primary focus is on ensuring "
            "all references to external documents, exhibits, regulations, or statutes are "
            "identified accurately. You write in elegant and expressive markdown."
        )

        user_prompt = f"""\
            Given the contract below, please:

            Summarize the contract with attention to main purpose and parties.
            Enumerate all references to documents, laws, regulations, or external materials:
            Document/Regulation name
            Section or clause referencing it
            Brief note on relevance
            Identify any key definitions that link to external references or industry-standard terminology.
            Highlight any deadlines or termination clauses tied to external compliance requirements.
            Contract Text: {pdf_text} """
        return get_markdown_response(system_prompt, user_prompt)

    def prompt_5_bullet_points(pdf_text: str) -> str:
        system_prompt = (
            "You are a paralegal who must produce a bullet-point cheat sheet for "
            "attorneys seeking a quick reference guide. You write in elegant and expressive markdown."
        )

        user_prompt = f"""\
        Read the contract below and produce a bullet-point summary with the following sections:

        1. Purpose & Context
        2. Parties
        3. Key Dates
        4. Key Definitions
        5. Termination & Renewal
        6. Referenced Documents & Regulations (including names, dates, versions, relevant sections)
        Contract Text: {pdf_text} """

        return get_markdown_response(system_prompt, user_prompt)

    def create_searchable_summary(full_summary: str) -> str:
        """
        Creates a concise, searchable summary from the full markdown summary,
        optimized for document discovery.

        :param full_summary: The detailed markdown summary
        :return: A 2-3 sentence searchable summary
        """
        system_prompt = (
            "You are a legal knowledge management specialist. Your task is to create "
            "a concise 2-3 sentence summary of a contract that will help paralegals "
            "quickly find this document in a search index. Include specific details "
            "like party names, dates, and particular context while maintaining clarity. "
            "Focus on what makes this contract unique and identifiable."
        )

        user_prompt = f"""\
            Based on the following detailed contract summary, create a 2-3 sentence summary
            that would help paralegals quickly identify this specific contract in a search.
            Include proper names, dates, and specific context where available. The summary
            should be both accurate and distinctive enough to differentiate this contract
            from similar ones.

            Detailed Summary:
            {full_summary}
            """

        return get_markdown_response(system_prompt, user_prompt)

    doc = Document.objects.get(id=doc_id)

    summary = prompt_1_single_pass(pdf_text_extract)
    reference_notes = prompt_4_references(pdf_text_extract)
    cheat_sheet = prompt_5_bullet_points(pdf_text_extract)
    searchable_summary = create_searchable_summary(summary)

    # Generate embeddings for the searchable summary
    try:
        embedder_class = get_preferred_embedder(doc.file_type)
        if embedder_class:
            embedder = embedder_class()
            description_embeddings = embedder.embed_text(searchable_summary)
            doc.description_embedding = description_embeddings
    except Exception as e:
        logger.error(f"Failed to generate description embeddings: {e}")

    doc.md_summary_file = ContentFile(summary.encode("utf-8"), name="summary.md")
    doc.description = searchable_summary
    doc.save()

    Note.objects.create(
        title="Referenced Documents",
        document=doc,
        content=reference_notes,
        corpus_id=corpus_id,
        creator=doc.creator,
    )

    Note.objects.create(
        title="Quick Reference",
        document=doc,
        content=cheat_sheet,
        corpus_id=corpus_id,
        creator=doc.creator,
    )

    return [], [], [], True


@doc_analyzer_task(
    input_schema={
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "AgenticHighlighterSchema",
        "type": "object",
        "properties": {
            "instructions": {
                "type": "string",
                "title": "Instructions",
                "description": "User's instructions describing what to highlight in the document.",
            },
        },
        "required": ["instructions"],
        "additionalProperties": False,
    }
)
def agentic_highlighter_claude(
    *args: Any,
    pdf_text_extract: str | None = None,
    pdf_pawls_extract: dict | None = None,
    **kwargs: Any,
) -> Tuple[List[str], List[Tuple[TextSpan, str]], List[dict], bool]:
    """
    An alternative to the existing agentic_highlighter that uses Anthropic Claude's
    citation API. It will accept the PDF text and user instructions, then chunk
    the doc if necessary, send each chunk to Claude with citations enabled, and
    collect relevant excerpts from each chunk. Returns matched text as TextSpans.

    :param pdf_text_extract: The full text of the PDF document to be analyzed.
    :param pdf_pawls_extract: Unused in this version, but included for signature consistency.
    :param kwargs: A dictionary allowing additional arguments, including:
        - instructions: The highlighting instructions.
        - doc_id: The ID of the Document object in the database.
    :return: A tuple containing:
        - List[str]: Unused in this version (empty list).
        - List[Tuple[TextSpan, str]]: The list of matched text spans and their label.
        - List[dict]: A list of dictionaries containing any errors or debug info.
        - bool: Success status of the operation.
    """

    import os
    import anthropic
    import math
    import logging

    from django.conf import settings
    from opencontractserver.documents.models import Document

    logger = logging.getLogger(__name__)

    logger.info("Starting agentic_highlighter_claude task")
    instructions = kwargs.get("instructions", "No instructions provided.")
    doc_id = kwargs.get("doc_id")
    logger.info(f"Task parameters - doc_id: {doc_id}, instructions: {instructions}")

    if not pdf_text_extract or not doc_id:
        logger.info("Missing required input - returning early")
        return [], [], [{"data": {"error": "Missing required input"}}], False

    # Ensure the Document exists
    try:
        doc = Document.objects.get(pk=doc_id)
        logger.info(f"Successfully retrieved document with id {doc_id}")
    except Document.DoesNotExist:
        logger.info(f"Document with id {doc_id} not found")
        return [], [], [{"data": {"error": "Document not found"}}], False

    # Setup Anthropic client
    # The API key is typically provided in settings or environment variable
    kwargs = getattr(settings, "ANALYZER_KWARGS", {})
    analyzer_kwargs = kwargs.get("opencontractserver.tasks.doc_analysis_tasks.agentic_highlighter_claude", {})
    ANTHROPIC_API_KEY = analyzer_kwargs.get("ANTHROPIC_API_KEY", None) or os.environ.get("ANTHROPIC_API_KEY", None)
    if not ANTHROPIC_API_KEY:
        logger.info("Anthropic API key not found in settings or environment")
        return [], [], [{"data": {"error": "Anthropic API key not found"}}], False

    logger.info("Successfully configured Anthropic API key")
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Maximum chunk size in characters. You may adjust this if you know your model's context window
    # (approx 100k tokens for claude-3-5, but we use a smaller slice to be safe).
    MAX_CHARS_PER_CHUNK = 80000

    def chunk_text(text: str, chunk_size: int = MAX_CHARS_PER_CHUNK) -> list[str]:
        """
        Splits text into sized chunks, ignoring word boundaries in a naive manner.

        :param text: The full text to be chunked.
        :param chunk_size: Maximum characters per chunk.
        :return: A list of chunked text strings.
        """
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        current_index = 0
        while current_index < len(text):
            end_index = min(current_index + chunk_size, len(text))
            chunks.append(text[current_index:end_index])
            current_index = end_index

        return chunks

    # Create text chunks for big documents
    doc_chunks = chunk_text(pdf_text_extract, MAX_CHARS_PER_CHUNK)
    logger.info(f"Split document into {len(doc_chunks)} chunks")

    # We'll store all matched spans across all chunks here
    all_spans: List[Tuple[TextSpan, str]] = []
    error_responses: List[dict] = []

    # Build the system prompt
    system_directive = (
        "You are a contract interpretation expert. "
        f"You have received the following user instructions:\n\n\"{instructions}\"\n\n"
        "Your goal: Identify relevant text from the contract. Review the full document text if possible, "
        "or use the largest available chunks of text to find relevant excerpts.\n\n"
        "Use citations so we can locate the relevant text within each chunk. "
        "If you cannot find any relevant excerpts, respond with empty text. "
        "No extra commentary. Return only the relevant text, or nothing."
    )
    logger.info("Created system directive for Claude")

    # We'll process each chunk in turn
    offset_so_far = 0
    for chunk_index, chunk_text_str in enumerate(doc_chunks):
        logger.info(f"Processing chunk {chunk_index + 1} of {len(doc_chunks)}")
        try:
            # Prepare single 'document' object with citations = True
            document_for_claude = {
                "type": "document",
                "source": {
                    "type": "text",
                    "media_type": "text/plain",
                    "data": chunk_text_str,
                },
                "title": f"Chunk-{chunk_index}",
                "citations": {"enabled": True},
            }

            # Create the request
            request_payload = [
                # The chunked doc
                document_for_claude,
                # The instructions / user message
                {"type": "text", "text": "Please extract the relevant text as specified."},
            ]

            logger.info(f"Sending request to Claude for chunk {chunk_index + 1}")
            response = client.messages.create(
                model="claude-3-5-sonnet-latest",
                temperature=0.0,
                max_tokens=1024,
                system=system_directive,
                messages=[
                    {"role": "user", "content": request_payload},
                ],
            )

            # Parse the response from Claude
            if not response or not response.content:
                logger.info(f"No content in response for chunk {chunk_index + 1}")
                continue

            # For each block of the response:
            for content_msg in response.content:
                if content_msg.type == "text":
                    snippet_text = content_msg.text.strip()

                    # If there's no text or it's empty, skip
                    if not snippet_text:
                        logger.info(f"Empty text content in chunk {chunk_index + 1}")
                        continue

                    logger.info(f"Processing text content in chunk {chunk_index + 1}")
                    # If there's citation data, we'll parse them; if not, do naive substring
                    # match. Claude may produce partial citations, so we handle them:
                    # We'll match the entire snippet_text in the chunk. 
                    # Then for each match, build a TextSpan.

                    # Potentially multiple citations in the block
                    # We'll also handle the case of no citations.
                    found_citations = getattr(content_msg, "citations", [])

                    # If no citations were provided, simply attempt to find the entire snippet in the chunk
                    if not found_citations:
                        logger.info(f"No citations found in chunk {chunk_index + 1}, using full text matching")
                        start_search = 0
                        while True:
                            idx = chunk_text_str.find(snippet_text, start_search)
                            if idx == -1:
                                break
                            # Build the span
                            span = TextSpan(
                                id=f"chunk_{chunk_index}_match_{len(all_spans)}",
                                start=offset_so_far + idx,
                                end=offset_so_far + idx + len(snippet_text),
                                text=snippet_text,
                            )
                            all_spans.append((span, "AGENTIC_HIGHLIGHT"))
                            logger.info(f"Added span from full text match in chunk {chunk_index + 1}")
                            start_search = idx + len(snippet_text)
                    else:
                        logger.info(f"Found {len(found_citations)} citations in chunk {chunk_index + 1}")
                        # If citations exist, each citation can be smaller or bigger block of text
                        # We'll find them in the chunk. 
                        for citation_obj in found_citations:
                            cited_substring = citation_obj.cited_text.strip()

                            # Find all occurrences of the cited_substring within the chunk
                            start_search = 0
                            while True:
                                idx = chunk_text_str.find(cited_substring, start_search)
                                if idx == -1:
                                    break
                                span = TextSpan(
                                    id=f"chunk_{chunk_index}_match_{len(all_spans)}",
                                    start=offset_so_far + idx,
                                    end=offset_so_far + idx + len(cited_substring),
                                    text=cited_substring,
                                )
                                all_spans.append((span, "AGENTIC_HIGHLIGHT"))
                                logger.info(f"Added span from citation in chunk {chunk_index + 1}")
                                start_search = idx + len(cited_substring)

        except Exception as exc:
            logger.exception(f"Error in Claude chunk {chunk_index}: {exc}")
            error_responses.append({"data": {"error": str(exc), "chunk": chunk_index}})

        # Move offset for the next chunk
        offset_so_far += len(chunk_text_str)
        logger.info(f"Completed processing chunk {chunk_index + 1}")

    logger.info(f"Total spans found: {len(all_spans)}")
    logger.info(f"Error responses: {error_responses}")

    # If anything went wrong in any chunk, success is still True if we found at least some spans
    # but we'll record all errors in error_responses
    # Return them so the caller can see them if needed.
    success = True
    logger.info("Completed agentic_highlighter_claude task")

    return [], all_spans, error_responses, success
