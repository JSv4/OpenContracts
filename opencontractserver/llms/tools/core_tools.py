"""Framework-agnostic core tool functions for document and note operations."""

import logging
from typing import Any, Optional

from opencontractserver.annotations.models import Note, NoteRevision
from opencontractserver.corpuses.models import Corpus, CorpusDescriptionRevision
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
        return "NO SUMMARY PREPARED"

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
        return 0

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
        return 0

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
        return "NO SUMMARY PREPARED"

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
                "content": (
                    note.content[:512] if note.content else ""
                ),  # Truncate for performance
                "creator_id": note.creator_id,
                "created": note.created.isoformat() if note.created else None,
                "modified": note.modified.isoformat() if note.modified else None,
            }
        )

    return notes


# --------------------------------------------------------------------------- #
# Plain-text extract helpers                                                  #
# --------------------------------------------------------------------------- #

# In-memory cache keyed by ``document_id`` so subsequent calls avoid disk IO.
# NOTE: This is **per-process** only – the cache is reset when the worker
# restarts. For long-running workers this provides a fast path while keeping
# memory usage bounded by the number of distinct documents accessed.
_DOC_TXT_CACHE: dict[int, str] = {}


def load_document_txt_extract(
    document_id: int,
    start: int | None = None,
    end: int | None = None,
    *,
    refresh: bool = False,
) -> str:
    """Load the plain-text extraction stored in a Document's ``txt_extract_file``.

    The returned string can be sliced by providing *start* and *end* character
    indices. Supplying *refresh=True* forces a cache miss, re-reading the file
    from disk even if a cached copy exists.

    Parameters
    ----------
    document_id:
        Primary key of the :class:`~opencontractserver.documents.models.Document`.
    start:
        Optional inclusive start index. Defaults to ``0`` when *None*.
    end:
        Optional exclusive end index. Defaults to the end of the file when
        *None*.
    refresh:
        If ``True`` the cached content for *document_id* is discarded and the
        file is read from disk again.

    Returns
    -------
    str
        The requested slice of the document's text extract.

    Raises
    ------
    ValueError
        If the document does not exist, has no ``txt_extract_file`` attached, or
        if *start*/*end* indices are invalid.
    """
    from opencontractserver.documents.models import (  # local import to avoid circular deps
        Document,
    )

    if refresh and document_id in _DOC_TXT_CACHE:
        _DOC_TXT_CACHE.pop(document_id, None)

    if document_id not in _DOC_TXT_CACHE:
        # Populate the cache – may raise if document/file missing.
        try:
            doc = Document.objects.get(pk=document_id)
        except Document.DoesNotExist as exc:
            raise ValueError(f"Document with id={document_id} does not exist.") from exc

        if not doc.txt_extract_file:
            raise ValueError("No txt_extract_file attached to this document.")

        _DOC_TXT_CACHE[document_id] = doc.txt_extract_file.read().decode("utf-8")
        logger.debug(
            "Cached txt_extract_file for document %s (%d characters)",
            document_id,
            len(_DOC_TXT_CACHE[document_id]),
        )

    content = _DOC_TXT_CACHE[document_id]

    # Normalise indices.
    start_idx = 0 if start is None else max(0, start)
    end_idx = len(content) if end is None else end

    if end_idx < start_idx:
        raise ValueError("End index must be greater than or equal to start index.")

    return content[start_idx:end_idx]


async def aload_document_txt_extract(
    document_id: int,
    start: int | None = None,
    end: int | None = None,
    *,
    refresh: bool = False,
) -> str:
    """Async wrapper around :func:`load_document_txt_extract`."""
    from channels.db import database_sync_to_async

    return await database_sync_to_async(load_document_txt_extract)(
        document_id, start, end, refresh=refresh
    )


# --------------------------------------------------------------------------- #
# Corpus description helpers                                                  #
# --------------------------------------------------------------------------- #


def get_corpus_description(
    corpus_id: int,
    truncate_length: int | None = None,
    from_start: bool = True,
) -> str:
    """Return the latest markdown description for a corpus.

    Parameters
    ----------
    corpus_id: int
        Primary key of the `Corpus`.
    truncate_length: int | None, optional
        If provided, returns at most this many characters. Positive values only.
    from_start: bool
        If ``True`` truncates from the beginning; otherwise from the end.
    """

    try:
        corpus = Corpus.objects.get(pk=corpus_id)
    except Corpus.DoesNotExist as exc:
        raise ValueError(f"Corpus with id={corpus_id} does not exist.") from exc

    if not corpus.md_description:
        return ""

    with corpus.md_description.open("r") as fh:
        content = fh.read()

    if truncate_length and truncate_length > 0:
        content = (
            content[:truncate_length] if from_start else content[-truncate_length:]
        )

    return content


async def aget_corpus_description(
    corpus_id: int,
    truncate_length: int | None = None,
    from_start: bool = True,
) -> str:
    """Async wrapper around :func:`get_corpus_description`."""
    from channels.db import database_sync_to_async

    return await database_sync_to_async(get_corpus_description)(
        corpus_id, truncate_length, from_start
    )


def update_corpus_description(
    *, corpus_id: int, new_content: str, author_id: int | None = None, author=None
) -> CorpusDescriptionRevision | None:
    """Version-up the corpus description, creating the markdown file if needed.

    Either ``author`` (User instance) or ``author_id`` must be provided.
    Returns the created `CorpusDescriptionRevision` or ``None`` when the content
    has not changed.
    """

    if author is None and author_id is None:
        raise ValueError("Provide either author or author_id.")

    if author is None:
        from django.contrib.auth import get_user_model

        author = get_user_model().objects.get(pk=author_id)

    try:
        corpus = Corpus.objects.get(pk=corpus_id)
    except Corpus.DoesNotExist as exc:
        raise ValueError(f"Corpus with id={corpus_id} does not exist.") from exc

    return corpus.update_description(new_content=new_content, author=author)


async def aupdate_corpus_description(
    *, corpus_id: int, new_content: str, author_id: int | None = None, author=None
):
    """Async wrapper around :func:`update_corpus_description`."""
    from channels.db import database_sync_to_async

    return await database_sync_to_async(update_corpus_description)(
        corpus_id=corpus_id, new_content=new_content, author_id=author_id, author=author
    )


# --------------------------------------------------------------------------- #
# Note creation / updating                                                    #
# --------------------------------------------------------------------------- #


def add_document_note(
    *,
    document_id: int,
    title: str,
    content: str,
    creator_id: int,
    corpus_id: int | None = None,
) -> Note:
    """Create and return a new Note for a given document."""

    try:
        Document.objects.get(pk=document_id)
    except Document.DoesNotExist as exc:
        raise ValueError(f"Document with id={document_id} does not exist.") from exc

    note = Note.objects.create(
        document_id=document_id,
        corpus_id=corpus_id,
        title=title,
        content=content,
        creator_id=creator_id,
    )

    return note


async def aadd_document_note(
    *,
    document_id: int,
    title: str,
    content: str,
    creator_id: int,
    corpus_id: int | None = None,
):
    from channels.db import database_sync_to_async

    return await database_sync_to_async(add_document_note)(
        document_id=document_id,
        title=title,
        content=content,
        creator_id=creator_id,
        corpus_id=corpus_id,
    )


def update_document_note(
    *, note_id: int, new_content: str, author_id: int | None = None
) -> NoteRevision | None:
    """Version-up a note's content."""

    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist as exc:
        raise ValueError(f"Note with id={note_id} does not exist.") from exc

    return note.version_up(new_content=new_content, author=author_id)


async def aupdate_document_note(
    *, note_id: int, new_content: str, author_id: int | None = None, author=None
):
    from channels.db import database_sync_to_async

    return await database_sync_to_async(update_document_note)(
        note_id=note_id, new_content=new_content, author_id=author_id, author=author
    )


def search_document_notes(
    document_id: int,
    search_term: str,
    *,
    corpus_id: int | None = None,
    limit: int | None = None,
) -> list[dict[str, str | int]]:

    import django

    """Return notes for *document_id* whose title or content contains *search_term* (case-insensitive)."""

    if not Document.objects.filter(pk=document_id).exists():
        raise ValueError(f"Document with id={document_id} does not exist.")

    notes_qs = Note.objects.filter(document_id=document_id)

    if corpus_id is not None:
        notes_qs = notes_qs.filter(corpus_id=corpus_id)

    notes_qs = notes_qs.filter(
        django.db.models.Q(title__icontains=search_term)
        | django.db.models.Q(content__icontains=search_term)
    ).order_by("-modified")

    if limit and limit > 0:
        notes_qs = notes_qs[:limit]

    return [
        {
            "id": note.id,
            "title": note.title,
            "content": note.content,
            "creator_id": note.creator_id,
            "created": note.created.isoformat() if note.created else None,
            "modified": note.modified.isoformat() if note.modified else None,
        }
        for note in notes_qs
    ]


async def asearch_document_notes(
    document_id: int,
    search_term: str,
    *,
    corpus_id: int | None = None,
    limit: int | None = None,
):
    from channels.db import database_sync_to_async

    return await database_sync_to_async(search_document_notes)(
        document_id, search_term, corpus_id=corpus_id, limit=limit
    )
