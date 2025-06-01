"""Framework-agnostic core tool functions for document and note operations."""

import logging
from typing import Any, Optional

from opencontractserver.annotations.models import Note
from opencontractserver.documents.models import Document

logger = logging.getLogger(__name__)


def _token_count(text: str) -> int:
    """
    Naive token counting function. Splits on whitespace.
    Replace or augment with more robust tokenization if needed.

    Args:
        text: The text to count tokens for

    Returns:
        Number of tokens (whitespace-separated words)
    """
    return len(text.split())


def load_document_md_summary(
    document_id: int,
    truncate_length: Optional[int] = None,
    from_start: bool = True,
) -> str:
    """
    Load the content of a Document's md_summary_file field.

    Args:
        document_id: The primary key (ID) of the Document
        truncate_length: Optional number of characters to truncate. If provided,
                        returns only that many characters
        from_start: If True, return from the start up to truncate_length.
                   Otherwise, return from the end

    Returns:
        A string containing the content of the md_summary_file (possibly truncated)

    Raises:
        ValueError: If document doesn't exist or has no md_summary_file
    """
    try:
        doc = Document.objects.get(pk=document_id)
    except Document.DoesNotExist:
        raise ValueError(f"Document with id={document_id} does not exist.")

    if not doc.md_summary_file:
        raise ValueError("No md_summary_file attached to this document.")

    # Read the md_summary_file
    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()
        logger.debug(f"Loaded md_summary_file for document {document_id}")

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


def get_md_summary_token_length(document_id: int) -> int:
    """
    Calculate the approximate token length of a Document's md_summary_file.
    Uses a naive whitespace-based split for tokenization.

    Args:
        document_id: The primary key (ID) of the Document

    Returns:
        An integer representing the approximate token count of the md_summary_file

    Raises:
        ValueError: If document doesn't exist or has no md_summary_file
    """
    try:
        doc = Document.objects.get(pk=document_id)
    except Document.DoesNotExist:
        raise ValueError(f"Document with id={document_id} does not exist.")

    if not doc.md_summary_file:
        raise ValueError("No md_summary_file attached to this document.")

    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()

    return _token_count(content)


def get_notes_for_document_corpus(
    document_id: int,
    corpus_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Retrieve all Note objects for a given document and (optionally) a specific corpus.

    Args:
        document_id: The primary key (ID) of the Document
        corpus_id: The primary key (ID) of the Corpus, or None if unspecified

    Returns:
        A list of dictionaries, each containing Note data (content truncated to 512 chars):
        [
            {
                "id": <note_id>,
                "title": <title>,
                "content": <content>,
                "creator_id": <creator_id>,
                "created": <created_datetime_iso>,
                "modified": <modified_datetime_iso>,
            },
            ...
        ]

    Raises:
        ValueError: If document doesn't exist
    """
    # Verify document exists
    if not Document.objects.filter(pk=document_id).exists():
        raise ValueError(f"Document with id={document_id} does not exist.")

    note_query = Note.objects.filter(document_id=document_id)
    if corpus_id is not None:
        note_query = note_query.filter(corpus_id=corpus_id)

    notes = note_query.order_by("created")
    return [
        {
            "id": note.id,
            "title": note.title,
            "content": note.content[:512] if note.content else "",
            "creator_id": note.creator_id,
            "created": note.created.isoformat() if note.created else None,
            "modified": note.modified.isoformat() if note.modified else None,
        }
        for note in notes
    ]


def get_note_content_token_length(note_id: int) -> int:
    """
    Calculate the approximate token length of a Note's content using naive whitespace-based split.

    Args:
        note_id: The primary key (ID) of the Note

    Returns:
        An integer representing the approximate token count of the note's content

    Raises:
        ValueError: If note doesn't exist
    """
    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist:
        raise ValueError(f"Note with id={note_id} does not exist.")

    return _token_count(note.content or "")


def get_partial_note_content(
    note_id: int,
    start: int = 0,
    end: int = 500,
) -> str:
    """
    Retrieve a substring of the note's content from index 'start' to index 'end'.

    Args:
        note_id: The primary key (ID) of the Note
        start: The starting position for extraction
        end: The position at which to stop before extraction (non-inclusive)

    Returns:
        A string representing the specified portion of the note's content

    Raises:
        ValueError: If note doesn't exist or invalid start/end indices
    """
    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist:
        raise ValueError(f"Note with id={note_id} does not exist.")

    content = note.content or ""

    if start < 0:
        start = 0
    if end < start:
        raise ValueError("End index must be greater than or equal to start index.")

    return content[start:end]


async def aget_md_summary_token_length(document_id: int) -> int:
    """
    Async version: Calculate the approximate token length of a Document's md_summary_file.
    Uses a naive whitespace-based split for tokenization.

    Args:
        document_id: The primary key (ID) of the Document

    Returns:
        An integer representing the approximate token count of the md_summary_file

    Raises:
        ValueError: If document doesn't exist or has no md_summary_file
    """
    try:
        from opencontractserver.documents.models import Document

        doc = await Document.objects.aget(pk=document_id)
    except Document.DoesNotExist:
        raise ValueError(f"Document with id={document_id} does not exist.")

    if not doc.md_summary_file:
        raise ValueError("No md_summary_file attached to this document.")

    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()

    return _token_count(content)


async def aload_document_md_summary(
    document_id: int,
    truncate_length: Optional[int] = None,
    from_start: bool = True,
) -> str:
    """
    Async version: Load and return the content of a Document's md_summary_file.

    Args:
        document_id: The primary key (ID) of the Document
        truncate_length: Optional length to truncate the content
        from_start: If True, truncate from start; if False, truncate from end

    Returns:
        The content of the md_summary_file as a string

    Raises:
        ValueError: If document doesn't exist or has no md_summary_file
    """
    try:
        from opencontractserver.documents.models import Document

        doc = await Document.objects.aget(pk=document_id)
    except Document.DoesNotExist:
        raise ValueError(f"Document with id={document_id} does not exist.")

    if not doc.md_summary_file:
        raise ValueError("No md_summary_file attached to this document.")

    with doc.md_summary_file.open("r") as file_obj:
        content = file_obj.read()
        logger.debug(f"Loaded md_summary_file for document {document_id}")

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


async def aget_notes_for_document_corpus(
    document_id: int,
    corpus_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    """
    Async version: Retrieve all Note objects for a given document and (optionally) a specific corpus.

    Args:
        document_id: The primary key (ID) of the Document
        corpus_id: The primary key (ID) of the Corpus, or None if unspecified

    Returns:
        A list of dictionaries, each containing Note data
    """
    from opencontractserver.annotations.models import Note

    queryset = Note.objects.filter(document_id=document_id)

    if corpus_id is not None:
        queryset = queryset.filter(corpus_id=corpus_id)

    notes = []
    async for note in queryset:
        notes.append(
            {
                "id": note.id,
                "title": note.title,
                "content": note.content[:512]
                if note.content
                else "",  # Truncate for performance
                "creator_id": note.creator_id,
                "created": note.created.isoformat() if note.created else None,
                "modified": note.modified.isoformat() if note.modified else None,
            }
        )

    return notes
