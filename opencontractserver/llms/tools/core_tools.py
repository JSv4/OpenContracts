"""Framework-agnostic core tool functions for document and note operations."""

import logging
from functools import partial
from typing import Any, Optional
from uuid import uuid4

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
# We need a robust helper that **always** executes the wrapped function in a
# *fresh* worker thread so the database connection opened inside that thread is
# guaranteed to be valid for the lifetime of the call.  Re-using the same
# thread between subsequent invocations (the default behaviour when
# ``thread_sensitive=True``) risks the connection becoming stale once Django
# closes it at the end of a test case – ultimately raising the dreaded
# "the connection is closed" OperationalError when the old thread is re-used.
#
# To avoid this we create a partially-applied wrapper with
# ``thread_sensitive=False`` irrespective of whether Channels is installed.  We
# fall back to ``asgiref.sync.sync_to_async`` when Channels is unavailable,
# applying the same parameter.
# --------------------------------------------------------------------------- #

try:
    from channels.db import (
        database_sync_to_async as _database_sync_to_async,  # type: ignore
    )

    _db_sync_to_async = partial(_database_sync_to_async, thread_sensitive=False)  # type: ignore
except ModuleNotFoundError:  # Channels not installed – fall back gracefully
    from asgiref.sync import sync_to_async as _sync_to_async  # type: ignore

    _db_sync_to_async = partial(_sync_to_async, thread_sensitive=False)  # type: ignore


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
    """Asynchronously load a slice of a document's ``txt_extract_file``.

    This implementation avoids the thread-pool wrapper by relying on Django's
    native async ORM utilities (``aget`` et al.). Only file IO remains
    synchronous which is acceptable given the typically small size of the
    text-extract payload.
    """

    from opencontractserver.documents.models import Document  # local import

    # Refresh – evict any existing cache entry first.
    if refresh and document_id in _DOC_TXT_CACHE:
        _DOC_TXT_CACHE.pop(document_id, None)

    # Populate cache on first access.
    if document_id not in _DOC_TXT_CACHE:
        try:
            doc = await Document.objects.aget(pk=document_id)
        except Document.DoesNotExist as exc:
            raise ValueError(f"Document with id={document_id} does not exist.") from exc

        if not doc.txt_extract_file:
            raise ValueError("No txt_extract_file attached to this document.")

        # Reading from ``FileField`` is inherently blocking – perform the read
        # synchronously but keep the payload in memory thereafter to avoid
        # repetitive disk (or network) IO.
        doc.txt_extract_file.open("rb")  # type: ignore[arg-type]
        try:
            _DOC_TXT_CACHE[document_id] = doc.txt_extract_file.read().decode("utf-8")
        finally:
            doc.txt_extract_file.close()

        logger.debug(
            "Cached txt_extract_file for document %s (%d characters)",
            document_id,
            len(_DOC_TXT_CACHE[document_id]),
        )

    content = _DOC_TXT_CACHE[document_id]

    # Normalise indices and slice.
    start_idx = 0 if start is None else max(0, start)
    end_idx = len(content) if end is None else end

    if end_idx < start_idx:
        raise ValueError("End index must be greater than or equal to start index.")

    return content[start_idx:end_idx]


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
    """Async implementation of :func:`get_corpus_description` using native ORM calls."""

    from opencontractserver.corpuses.models import Corpus  # local import

    try:
        corpus = await Corpus.objects.aget(pk=corpus_id)
    except Corpus.DoesNotExist as exc:
        raise ValueError(f"Corpus with id={corpus_id} does not exist.") from exc

    if not corpus.md_description:
        return ""

    corpus.md_description.open("r")  # type: ignore[arg-type]
    try:
        content: str = corpus.md_description.read()
    finally:
        corpus.md_description.close()

    if truncate_length and truncate_length > 0:
        content = (
            content[:truncate_length] if from_start else content[-truncate_length:]
        )

    return content


def update_corpus_description(
    *,
    corpus_id: int,
    new_content: str | None = None,
    diff_text: str | None = None,
    author_id: int | None = None,
    author=None,
) -> "CorpusDescriptionRevision | None":
    """Patch or replace a corpus markdown description.

    Provide either *new_content* or an ``ndiff`` *diff_text* that will be
    applied to the current description.  Mirrors the behaviour of
    :py:meth:`Corpus.update_description`.
    """

    if new_content is None and diff_text is None:
        raise ValueError("Provide either new_content or diff_text")

    if new_content is not None and diff_text is not None:
        raise ValueError("Provide only one of new_content or diff_text, not both")

    if author is None and author_id is None:
        raise ValueError("Provide either author or author_id.")

    try:
        corpus = Corpus.objects.get(pk=corpus_id)
    except Corpus.DoesNotExist as exc:
        raise ValueError(f"Corpus with id={corpus_id} does not exist.") from exc

    if diff_text is not None:
        # Need current content
        current = corpus._read_md_description_content()
        new_content = _apply_ndiff_patch(current, diff_text)

    return corpus.update_description(
        new_content=new_content, author=author or author_id
    )


async def aupdate_corpus_description(
    *,
    corpus_id: int,
    new_content: str | None = None,
    diff_text: str | None = None,
    author_id: int | None = None,
    author=None,
):
    """Async variant of :func:`update_corpus_description` relying on Django's async ORM."""

    import difflib
    import hashlib

    from django.contrib.auth import get_user_model
    from django.core.files.base import ContentFile
    from django.db import transaction
    from django.utils import timezone

    from opencontractserver.corpuses.models import (
        Corpus,
        CorpusDescriptionRevision,
    )

    if new_content is None and diff_text is None:
        raise ValueError("Provide either new_content or diff_text")

    if new_content is not None and diff_text is not None:
        raise ValueError("Provide only one of new_content or diff_text, not both")

    if author is None and author_id is None:
        raise ValueError("Provide either author or author_id.")

    try:
        corpus = await Corpus.objects.aget(pk=corpus_id)
    except Corpus.DoesNotExist as exc:
        raise ValueError(f"Corpus with id={corpus_id} does not exist.") from exc

    # Compute *new_content* from the diff when required.
    if diff_text is not None:
        current = corpus._read_md_description_content()
        new_content = _apply_ndiff_patch(current, diff_text)
    else:
        current = corpus._read_md_description_content()

    assert new_content is not None  # mypy – safeguarded above.

    # Resolve author.
    if author is None:
        User = get_user_model()
        author = await User.objects.aget(pk=author_id)  # type: ignore[assignment]

    # No change – early exit.
    if current == new_content:
        return None

    async with transaction.atomic():
        # Persist the new markdown file.
        filename = f"{uuid4()}.md"
        corpus.md_description.save(filename, ContentFile(new_content), save=False)  # type: ignore[arg-type]
        corpus.modified = timezone.now()
        await corpus.asave()

        # Compute next version number.
        latest_rev = (
            await CorpusDescriptionRevision.objects.filter(corpus_id=corpus.pk)
            .order_by("-version")
            .afirst()
        )
        next_version = 1 if latest_rev is None else latest_rev.version + 1

        diff_text_final = "\n".join(
            difflib.unified_diff(
                current.splitlines(), new_content.splitlines(), lineterm=""
            )
        )

        should_snapshot = (
            next_version % corpus.REVISION_SNAPSHOT_INTERVAL == 0 or next_version == 1
        )
        snapshot_text = new_content if should_snapshot else None

        revision = await CorpusDescriptionRevision.objects.acreate(
            corpus=corpus,
            author=author,
            version=next_version,
            diff=diff_text_final,
            snapshot=snapshot_text,
            checksum_base=hashlib.sha256(current.encode()).hexdigest(),
            checksum_full=hashlib.sha256(new_content.encode()).hexdigest(),
        )

    return revision


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
    """Create a new :class:`~opencontractserver.annotations.models.Note` asynchronously."""

    from opencontractserver.annotations.models import Note
    from opencontractserver.documents.models import Document

    # Ensure the document exists first.
    exists = await Document.objects.filter(pk=document_id).aexists()
    if not exists:
        raise ValueError(f"Document with id={document_id} does not exist.")

    note = await Note.objects.acreate(
        document_id=document_id,
        corpus_id=corpus_id,
        title=title,
        content=content,
        creator_id=creator_id,
    )

    return note


def _apply_ndiff_patch(original: str, diff_text: str) -> str:
    """Return *patched* text by applying an ``ndiff``-style diff.

    Raises ``ValueError`` when the diff cannot be applied.
    """

    import difflib

    try:
        patched_lines = difflib.restore(diff_text.splitlines(keepends=True), 2)
        return "".join(patched_lines)
    except Exception as exc:  # pragma: no cover
        raise ValueError("Failed to apply diff_text to original note content") from exc


def update_document_note(
    *,
    note_id: int,
    new_content: str | None = None,
    diff_text: str | None = None,
    author_id: int | None = None,
) -> NoteRevision | None:
    """Version‐up a note.

    Provide either *new_content* **or** *diff_text* (produced via
    ``difflib.ndiff``). When *diff_text* is given the function patches the
    current content to obtain the updated text.
    """

    if new_content is None and diff_text is None:
        raise ValueError("Provide either new_content or diff_text")

    if new_content is not None and diff_text is not None:
        raise ValueError("Provide only one of new_content or diff_text, not both")

    try:
        note = Note.objects.get(pk=note_id)
    except Note.DoesNotExist as exc:
        raise ValueError(f"Note with id={note_id} does not exist.") from exc

    if diff_text is not None:
        new_content = _apply_ndiff_patch(note.content or "", diff_text)

    return note.version_up(new_content=new_content, author=author_id)


async def aupdate_document_note(
    *,
    note_id: int,
    new_content: str | None = None,
    diff_text: str | None = None,
    author_id: int | None = None,
):
    """Async variant of ``update_document_note`` avoiding thread-pool hand-off."""

    import difflib
    import hashlib

    from django.contrib.auth import get_user_model
    from django.db import transaction
    from django.utils import timezone

    from opencontractserver.annotations.models import Note, NoteRevision

    if new_content is None and diff_text is None:
        raise ValueError("Provide either new_content or diff_text")

    if new_content is not None and diff_text is not None:
        raise ValueError("Provide only one of new_content or diff_text, not both")

    try:
        note = await Note.objects.aget(pk=note_id)
    except Note.DoesNotExist as exc:
        raise ValueError(f"Note with id={note_id} does not exist.") from exc

    # Resolve new_content when a diff is supplied.
    if diff_text is not None:
        new_content = _apply_ndiff_patch(note.content or "", diff_text)

    assert new_content is not None  # ensured above

    # Early exit if nothing changed.
    if (note.content or "") == new_content:
        return None

    # Resolve author (may be None for system actions).
    author = None
    if author_id is not None:
        User = get_user_model()
        author = await User.objects.aget(pk=author_id)

    async with transaction.atomic():
        original_content = note.content or ""

        # Update the note *without* triggering the automatic revision logic in
        # ``save`` – we perform the revision manually below. We therefore use
        # ``aupdate`` on the queryset.
        await Note.objects.filter(pk=note.pk).aupdate(
            content=new_content, modified=timezone.now()
        )

        latest_rev = (
            await NoteRevision.objects.filter(note_id=note.pk)
            .order_by("-version")
            .afirst()
        )
        next_version = 1 if latest_rev is None else latest_rev.version + 1

        diff_text_final = "\n".join(
            difflib.unified_diff(
                original_content.splitlines(), new_content.splitlines(), lineterm=""
            )
        )

        interval = getattr(Note, "REVISION_SNAPSHOT_INTERVAL", 10)
        should_snapshot = next_version % interval == 0
        snapshot_text = new_content if should_snapshot else None

        revision = await NoteRevision.objects.acreate(
            note_id=note.pk,
            author=author,
            version=next_version,
            diff=diff_text_final,
            snapshot=snapshot_text,
            checksum_base=hashlib.sha256(original_content.encode()).hexdigest(),
            checksum_full=hashlib.sha256(new_content.encode()).hexdigest(),
        )

    return revision


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
    """Async search for notes matching *search_term* within a document."""

    import django

    from opencontractserver.annotations.models import Note
    from opencontractserver.documents.models import Document

    # Validate document existence.
    exists = await Document.objects.filter(pk=document_id).aexists()
    if not exists:
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

    results: list[dict[str, str | int]] = []
    async for note in notes_qs:
        results.append(
            {
                "id": note.id,
                "title": note.title,
                "content": note.content,
                "creator_id": note.creator_id,
                "created": note.created.isoformat() if note.created else None,
                "modified": note.modified.isoformat() if note.modified else None,
            }
        )

    return results


# --------------------------------------------------------------------------- #
# Annotation duplication helpers                                              #
# --------------------------------------------------------------------------- #


def duplicate_annotations_with_label(
    annotation_ids: list[int],
    *,
    new_label_text: str,
    creator_id: int,
    label_type: str | None = None,
) -> list[int]:
    """Duplicate existing annotations applying *new_label_text* (synchronous).

    This synchronous variant ensures the required label-set and label exist on
    each annotation's corpus *without* relying on any helper methods grafted
    onto the :class:`~opencontractserver.corpuses.models.Corpus` model.

    Parameters
    ----------
    annotation_ids:
        Primary keys of the annotations to duplicate.
    new_label_text:
        The text of the label to assign to the duplicates. Case-sensitive.
    creator_id:
        User identifier recorded as *creator* for both the duplicates and for
        any label/label-set created on-the-fly.
    label_type:
        Optional label type (defaults to ``TOKEN_LABEL`` when *None*).

    Returns
    -------
    list[int]
        Primary keys of the newly created annotations in the same order as the
        input list.
    """

    from django.db import transaction

    from opencontractserver.annotations.models import (
        TOKEN_LABEL,
        Annotation,
        AnnotationLabel,
        LabelSet,
    )

    if label_type is None:
        label_type = TOKEN_LABEL

    # Fetch annotations; keep their database objects in memory while
    # preserving the order of *annotation_ids*.
    annotations = list(
        Annotation.objects.filter(pk__in=annotation_ids).select_related(
            "corpus", "document"
        )
    )

    if len(annotations) != len(annotation_ids):
        missing = set(annotation_ids) - {a.pk for a in annotations}
        raise ValueError(f"Annotation(s) not found: {sorted(missing)}")

    new_ids: list[int] = []
    label_cache: dict[int, AnnotationLabel] = {}

    with transaction.atomic():
        for ann in annotations:
            if ann.corpus_id is None:
                raise ValueError(
                    f"Annotation id={ann.pk} is not associated with a corpus and "
                    "cannot be duplicated with a corpus label."
                )

            corpus = ann.corpus  # already fetched via select_related

            # Obtain / create label for this corpus (use cache to minimise DB chatter).
            label = label_cache.get(corpus.pk)
            if label is None:
                # Ensure corpus has a label-set.
                if corpus.label_set_id is None:
                    corpus.label_set = LabelSet.objects.create(
                        title=f"LabelSet for Corpus {corpus.pk}",
                        description="",
                        creator_id=creator_id,
                    )
                    corpus.save(update_fields=["label_set", "modified"])

                # Look for existing label with given text & type.
                label_qs = corpus.label_set.annotation_labels.filter(
                    text=new_label_text, label_type=label_type
                )
                label = label_qs.first()

                if label is None:
                    label = AnnotationLabel.objects.create(
                        text=new_label_text,
                        label_type=label_type,
                        color="#05313d",
                        description="",
                        icon="tags",
                        creator_id=creator_id,
                    )
                    corpus.label_set.annotation_labels.add(label)

                label_cache[corpus.pk] = label

            # Create the duplicate annotation.
            duplicate = Annotation.objects.create(
                page=ann.page,
                raw_text=ann.raw_text,
                tokens_jsons=ann.tokens_jsons,
                bounding_box=ann.bounding_box,
                json=ann.json,
                parent=ann.parent,
                annotation_type=ann.annotation_type,
                annotation_label=label,
                document=ann.document,
                corpus=corpus,
                structural=ann.structural,
                creator_id=creator_id,
            )

            new_ids.append(duplicate.pk)

    return new_ids


async def aduplicate_annotations_with_label(
    annotation_ids: list[int],
    *,
    new_label_text: str,
    creator_id: int,
    label_type: str | None = None,
):
    """Async wrapper around :func:`duplicate_annotations_with_label`."""
    return await _db_sync_to_async(duplicate_annotations_with_label)(
        annotation_ids,
        new_label_text=new_label_text,
        creator_id=creator_id,
        label_type=label_type,
    )


# --------------------------------------------------------------------------- #
# Exact-string annotation helper for PDFs                                     #
# --------------------------------------------------------------------------- #


def add_annotations_from_exact_strings(
    items: list[tuple[str, str, int, int]],
    *,
    creator_id: int,
) -> list[int]:
    """Create annotations for exact string matches in documents.

    Each *item* is ``(label_text, exact_string, document_id, corpus_id)``.

    • PDF (application/pdf): builds token‐level annotations (TOKEN_LABEL) via PlasmaPDF.
    • Plain-text (application/txt, text/plain): builds span annotations (SPAN_LABEL).

    Other file types raise ``ValueError``.
    """

    import json
    from collections import defaultdict

    from django.db import transaction
    from plasmapdf.models.PdfDataLayer import build_translation_layer
    from plasmapdf.models.types import SpanAnnotation, TextSpan

    from opencontractserver.annotations.models import (
        SPAN_LABEL,
        TOKEN_LABEL,
        Annotation,
    )
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    # Group items by (doc_id, corpus_id) to avoid loading the same PAWLS layer multiple times.
    grouped: dict[tuple[int, int], list[tuple[str, str]]] = defaultdict(list)
    for label_text, exact_str, doc_id, corpus_id in items:
        grouped[(doc_id, corpus_id)].append((label_text, exact_str))

    created_ids: list[int] = []

    for (doc_id, corpus_id), tuples in grouped.items():
        # Validate document & corpus linkage.
        try:
            doc = Document.objects.get(pk=doc_id)
        except Document.DoesNotExist as exc:
            raise ValueError(f"Document id={doc_id} does not exist") from exc

        try:
            corpus = Corpus.objects.get(pk=corpus_id)
        except Corpus.DoesNotExist as exc:
            raise ValueError(f"Corpus id={corpus_id} does not exist") from exc

        if not corpus.documents.filter(pk=doc_id).exists():
            raise ValueError(
                f"Document id={doc_id} is not linked to corpus id={corpus_id}."
            )

        file_type = doc.file_type.lower()

        if file_type == "application/pdf":
            if not doc.pawls_parse_file:
                raise ValueError(
                    f"PDF document id={doc_id} lacks a PAWLS layer; cannot annotate."
                )

            # Load PAWLS tokens once per document.
            doc.pawls_parse_file.open("r")
            try:
                pawls_tokens = json.load(doc.pawls_parse_file)
            finally:
                doc.pawls_parse_file.close()

            pdf_layer = build_translation_layer(pawls_tokens)
            doc_text = pdf_layer.doc_text

            label_type_const = TOKEN_LABEL

            def _create_annotation(pos: int, end_idx: int, label_obj):
                span = TextSpan(
                    id=str(uuid4()), start=pos, end=end_idx, text=doc_text[pos:end_idx]
                )
                span_annotation = SpanAnnotation(
                    span=span, annotation_label=label_obj.text
                )
                oc_ann = pdf_layer.create_opencontract_annotation_from_span(
                    span_annotation
                )

                return Annotation(
                    raw_text=oc_ann["rawText"],
                    page=oc_ann.get("page", 1),
                    json=oc_ann["annotation_json"],
                    annotation_label=label_obj,
                    document=doc,
                    corpus=corpus,
                    creator_id=creator_id,
                    annotation_type=TOKEN_LABEL,
                    structural=False,
                )

        elif file_type in {"application/txt", "text/plain"}:
            if not doc.txt_extract_file:
                raise ValueError(
                    f"Text document id={doc_id} lacks txt_extract_file; cannot annotate."
                )
            doc.txt_extract_file.open("r")
            try:
                doc_text = doc.txt_extract_file.read()
            finally:
                doc.txt_extract_file.close()

            label_type_const = SPAN_LABEL

            def _create_annotation(pos: int, end_idx: int, label_obj):
                return Annotation(
                    raw_text=doc_text[pos:end_idx],
                    page=1,
                    json={"start": pos, "end": end_idx},
                    annotation_label=label_obj,
                    document=doc,
                    corpus=corpus,
                    creator_id=creator_id,
                    annotation_type=SPAN_LABEL,
                    structural=False,
                )

        else:
            raise ValueError(
                f"Unsupported file_type {doc.file_type} for document id={doc_id}"
            )

        # Common creation loop (works for both PDF and text).
        with transaction.atomic():
            for label_text, exact_str in tuples:
                label_obj = corpus.ensure_label_and_labelset(
                    label_text=label_text,
                    creator_id=creator_id,
                    label_type=label_type_const,
                )

                start_idx = 0
                while True:
                    pos = doc_text.find(exact_str, start_idx)
                    if pos == -1:
                        break

                    end_idx = pos + len(exact_str)

                    annot_obj = _create_annotation(pos, end_idx, label_obj)
                    annot_obj.save()

                    created_ids.append(annot_obj.pk)

                    start_idx = end_idx

    return created_ids


async def aadd_annotations_from_exact_strings(
    items: list[tuple[str, str, int, int]],
    *,
    creator_id: int,
):
    """Async wrapper around :func:`add_annotations_from_exact_strings`."""

    from channels.db import database_sync_to_async

    return await database_sync_to_async(add_annotations_from_exact_strings)(
        items, creator_id=creator_id
    )
