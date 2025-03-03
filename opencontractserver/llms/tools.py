"""
This module contains a set of LlamaIndex-compatible tools for interacting with
our Django models. These tools enable reading from document summary files,
detailing token counts, retrieving and partially retrieving notes, etc.
"""
import logging
from typing import Optional

from llama_index.core.tools import FunctionTool
from pydantic import Field

from opencontractserver.annotations.models import Note

# Assuming these imports resolve correctly within the project's structure:
from opencontractserver.documents.models import Document

logger = logging.getLogger(__name__)


def _token_count(text: str) -> int:
    """
    Naive token counting function. Splits on whitespace.
    Replace or augment with more robust tokenization if needed.
    """
    return len(text.split())


def load_document_md_summary(
    document_id: int = Field(..., description="Primary key of the Document."),
    truncate_length: Optional[int] = Field(
        None,
        description="Optional number of characters to truncate. If provided, returns only that many characters.",
    ),
    from_start: bool = Field(
        True,
        description="If truncate_length is provided, determines whether to return from start or end.",
    ),
) -> str:
    """
    Load the content of a Document's md_summary_file field.

    Args:
        document_id: The primary key (ID) of the Document.
        truncate_length: Optional integer specifying how many characters to return.
        from_start: If True, return from the start up to truncate_length. Otherwise, return from the end.

    Returns:
        A string containing the content of the md_summary_file (possibly truncated).
    """
    try:
        doc = Document.objects.get(pk=document_id)
    except Document.DoesNotExist:
        return f"Document with id={document_id} does not exist."

    if not doc.md_summary_file:
        return "No md_summary_file attached to this document."

    # Read the md_summary_file
    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()
        logger.info(f"Loaded md_summary_file for document {document_id}: {content}")

    # Convert truncate_length to int if it's a FieldInfo object
    if hasattr(truncate_length, "default"):
        truncate_length = truncate_length.default

    if (
        truncate_length is not None
        and isinstance(truncate_length, int)
        and truncate_length > 0
    ):
        if from_start:
            content = content[:truncate_length]
        else:
            content = content[-truncate_length:]

    return content


def get_md_summary_token_length(
    document_id: int = Field(..., description="Primary key of the Document.")
) -> int:
    """
    Calculates the approximate token length of a Document's md_summary_file.
    Uses a naive whitespace-based split for tokenization.

    Args:
        document_id: The primary key (ID) of the Document.

    Returns:
        An integer representing the approximate token count of the md_summary_file.
    """
    try:
        doc = Document.objects.get(pk=document_id)
    except Document.DoesNotExist:
        return 0

    if not doc.md_summary_file:
        return 0

    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()

    return _token_count(content)


def get_notes_for_document_corpus(
    document_id: int = Field(..., description="Primary key of the Document."),
    corpus_id: Optional[int] = Field(
        None,
        description="Optional primary key of the Corpus. If None, only notes without a corpus_id are returned.",
    ),
) -> list[dict]:
    """
    Retrieve all Note objects for a given document and (optionally) a specific corpus.

    Args:
        document_id: The primary key (ID) of the Document.
        corpus_id: The primary key (ID) of the Corpus, or None if unspecified.

    Returns:
        A list of dictionaries, each containing Note data (strings truncated to preview length of 512 characters):
        [
            {
                "id": <note_id>,
                "title": <title>,
                "content": <content>,
                "creator_id": <creator id>,
                "created": <created datetime>,
                "modified": <modified datetime>,
            },
            ...
        ]
    """
    note_query = Note.objects.filter(document_id=document_id)
    if corpus_id is not None:
        note_query = note_query.filter(corpus_id=corpus_id)

    notes = note_query.order_by("created")
    return [
        {
            "id": note.id,
            "title": note.title,
            "content": note.content[:512],
            "creator_id": note.creator_id,
            "created": note.created.isoformat() if note.created else None,
            "modified": note.modified.isoformat() if note.modified else None,
        }
        for note in notes
    ]


def get_note_content_token_length(
    note_id: int = Field(..., description="Primary key of the Note.")
) -> int:
    """
    Calculates the approximate token length of a Note's content using a naive whitespace-based split.

    Args:
        note_id: The primary key (ID) of the Note.

    Returns:
        An integer representing the approximate token count of the note's content.
    """
    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist:
        return 0

    return _token_count(note.content)


def get_partial_note_content(
    note_id: int = Field(..., description="Primary key of the Note."),
    start: int = Field(0, description="Start index for substring extraction."),
    end: int = Field(
        500,
        description="End index (non-inclusive) for substring extraction. Use a large number to see the entire note.",
    ),
) -> str:
    """
    Retrieve a substring of the note's content from index 'start' to index 'end'.

    Args:
        note_id: The primary key (ID) of the Note.
        start: The starting position for extraction.
        end: The position at which to stop before extraction (non-inclusive).

    Returns:
        A string representing the specified portion of the note's content.
    """
    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist:
        return f"Note with id={note_id} does not exist."

    content = note.content
    if start < 0:
        start = 0
    if end < start:
        end = start

    return content[start:end]


# Each tool can be initialized via LlamaIndex's FunctionTool.from_defaults()
load_document_md_summary_tool = FunctionTool.from_defaults(load_document_md_summary)
get_md_summary_token_length_tool = FunctionTool.from_defaults(
    get_md_summary_token_length
)
get_notes_for_document_corpus_tool = FunctionTool.from_defaults(
    get_notes_for_document_corpus
)
get_note_content_token_length_tool = FunctionTool.from_defaults(
    get_note_content_token_length
)
get_partial_note_content_tool = FunctionTool.from_defaults(get_partial_note_content)
