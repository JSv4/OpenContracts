import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, TransactionTestCase

from opencontractserver.annotations.models import TOKEN_LABEL, Annotation, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools import (
    get_md_summary_token_length,
    get_notes_for_document_corpus,
    load_document_md_summary,
)
from opencontractserver.llms.tools.core_tools import (
    _token_count,
    add_document_note,
    aduplicate_annotations_with_label,
    aget_corpus_description,
    aload_document_txt_extract,
    aupdate_corpus_description,
    aupdate_document_note,
    duplicate_annotations_with_label,
    get_corpus_description,
    load_document_txt_extract,
    search_document_notes,
    update_corpus_description,
    update_document_note,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class TestLLMTools(TestCase):
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(username="testuser", password="12345")

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
        )

        # Create a test document with a summary file
        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Document",
            description="Test Description",
        )

        # Create a mock summary file
        summary_content = (
            "This is a test summary.\nIt has multiple lines.\nAnd some content."
        )
        self.doc.md_summary_file.save(
            "test_summary.md", ContentFile(summary_content.encode())
        )

        # Create mock txt extract content and file
        self.txt_content = "This is test text extract content for document analysis."
        self.doc.txt_extract_file.save(
            "test_extract.txt", ContentFile(self.txt_content.encode())
        )

        # Create test notes
        self.note = Note.objects.create(
            document=self.doc,
            title="Test Note",
            content="Test note content that is longer than the typical preview length",
            creator=self.user,
        )

        # Prepare corpus markdown description via helper
        self.initial_corpus_md = "# Corpus\n\nInitial description"
        update_corpus_description(
            corpus_id=self.corpus.id,
            new_content=self.initial_corpus_md,
            author_id=self.user.id,
        )

        # Create second revision
        self.updated_corpus_md = "# Corpus\n\nUpdated description v2"
        update_corpus_description(
            corpus_id=self.corpus.id,
            new_content=self.updated_corpus_md,
            author_id=self.user.id,
        )

    def test_token_count_empty(self):
        """Test token counting with empty string."""
        result = _token_count("")
        self.assertEqual(result, 0)

    def test_token_count_whitespace(self):
        """Test token counting with only whitespace."""
        result = _token_count("   \n\t   ")
        self.assertEqual(result, 0)

    def test_load_document_md_summary_nonexistent_doc(self):
        """Test loading summary for non-existent document."""
        with self.assertRaisesRegex(
            ValueError, "Document with id=999999 does not exist."
        ):
            load_document_md_summary(999999)

    def test_load_document_md_summary_no_file(self):
        """Test loading summary when no summary file exists."""
        doc_without_summary = Document.objects.create(
            creator=self.user,
            title="No Summary Doc",
        )
        self.assertEqual(
            "NO SUMMARY PREPARED", load_document_md_summary(doc_without_summary.id)
        )

    def test_load_document_md_summary_truncate_from_end(self):
        """Test loading summary with truncation from end."""
        result = load_document_md_summary(
            self.doc.id, truncate_length=10, from_start=False
        )
        self.assertEqual(len(result), 10)

    def test_get_md_summary_token_length_nonexistent(self):
        """Test token length for non-existent document."""
        with self.assertRaisesRegex(
            ValueError, "Document with id=999999 does not exist."
        ):
            get_md_summary_token_length(999999)

    def test_get_md_summary_token_length_no_file(self):
        """Test token length when no summary file exists."""
        doc_without_summary = Document.objects.create(
            creator=self.user,
            title="No Summary Doc",
        )
        self.assertEqual(0, get_md_summary_token_length(doc_without_summary.id))

    def test_get_notes_for_document_corpus_with_truncation(self):
        """Test note retrieval with content truncation."""
        # Create a note with content longer than 512 characters
        long_content = "x" * 1000
        Note.objects.create(
            document=self.doc,
            title="Long Note",
            content=long_content,
            creator=self.user,
        )

        results = get_notes_for_document_corpus(
            document_id=self.doc.id, corpus_id=self.corpus.id
        )

        # Verify content truncation
        for note_dict in results:
            self.assertLessEqual(len(note_dict["content"]), 512)

        # Verify ordering by created date
        created_dates = [note["created"] for note in results]
        self.assertEqual(created_dates, sorted(created_dates))

    def test_load_document_txt_extract_success(self):
        """Test successful txt extract loading."""
        result = load_document_txt_extract(self.doc.id)
        self.assertEqual(result, self.txt_content)

    # ------------------------------------------------------------------
    # New tests for corpus description helpers
    # ------------------------------------------------------------------

    def test_get_corpus_description(self):
        """Should return the latest markdown description."""
        desc = get_corpus_description(self.corpus.id)
        self.assertEqual(desc, self.updated_corpus_md)

    def test_update_corpus_description_no_change_returns_none(self):
        """Updating with identical content should return None."""
        result = update_corpus_description(
            corpus_id=self.corpus.id,
            new_content=self.updated_corpus_md,
            author_id=self.user.id,
        )
        self.assertIsNone(result)

    # ------------------------------------------------------------------
    # New tests for note helpers
    # ------------------------------------------------------------------

    def test_add_and_search_document_note(self):
        """Add a new note and ensure it appears in search results."""

        new_note = add_document_note(
            document_id=self.doc.id,
            title="Searchable Note",
            content="This note contains keyword foobar in content.",
            creator_id=self.user.id,
        )

        results = search_document_notes(
            document_id=self.doc.id, search_term="foobar", limit=5
        )

        self.assertTrue(any(r["id"] == new_note.id for r in results))

    def test_update_document_note(self):
        """Version-up an existing note and verify content update."""

        old_revision_count = self.note.revisions.count()

        new_content = "Updated note content version 2"
        revision = update_document_note(
            note_id=self.note.id,
            new_content=new_content,
            author_id=self.user.id,
        )

        # Revision object is returned
        self.assertIsNotNone(revision)
        self.assertEqual(revision.version, old_revision_count + 1)

        # Note content updated
        self.note.refresh_from_db()
        self.assertEqual(self.note.content, new_content)

    # ------------------------------------------------------------------
    # New tests for annotation duplication helper
    # ------------------------------------------------------------------

    def test_duplicate_annotations_with_label(self):
        """Duplicate an annotation and ensure label/labelset are created."""

        # Create source annotation (no label-set on corpus yet).
        source_ann = Annotation.objects.create(
            page=1,
            raw_text="Sample annotation",
            document=self.doc,
            corpus=self.corpus,
            creator=self.user,
        )

        # Sanity: corpus should not have a label_set at this point.
        self.assertIsNone(self.corpus.label_set)

        new_ids = duplicate_annotations_with_label(
            [source_ann.id],
            new_label_text="NewLabel",
            creator_id=self.user.id,
        )

        # One duplicate should be produced.
        self.assertEqual(len(new_ids), 1)

        duplicate = Annotation.objects.get(pk=new_ids[0])

        # Corpus now has a label_set and the label inside it.
        self.corpus.refresh_from_db()
        self.assertIsNotNone(self.corpus.label_set)

        label = duplicate.annotation_label
        self.assertIsNotNone(label)
        self.assertEqual(label.text, "NewLabel")
        self.assertEqual(label.label_type, TOKEN_LABEL)
        self.assertIn(label, self.corpus.label_set.annotation_labels.all())

        # Duplicate keeps original fields.
        self.assertEqual(duplicate.page, source_ann.page)
        self.assertEqual(duplicate.raw_text, source_ann.raw_text)
        self.assertEqual(duplicate.document_id, source_ann.document_id)
        self.assertEqual(duplicate.corpus_id, source_ann.corpus_id)
        self.assertEqual(duplicate.creator_id, self.user.id)


class AsyncTestDuplicateTools(TransactionTestCase):
    """Separate test class for async tests to avoid database connection issues."""

    @classmethod
    def setUpClass(cls):
        """Set up test data."""
        super().setUpClass()

        cls.user = User.objects.create_user(username="testuser_async", password="12345")

        # Create a test document with txt extract file
        cls.doc = Document.objects.create(
            creator=cls.user,
            title="Async Test Document",
            description="Test Description",
        )

        # Create mock txt extract content and file
        cls.txt_content = (
            "This is test text extract content for async document analysis."
        )
        cls.doc.txt_extract_file.save(
            "test_extract_async.txt", ContentFile(cls.txt_content.encode())
        )

        cls.corpus = Corpus.objects.create(
            title="Async Corpus",
            creator=cls.user,
        )

        cls.annotation = Annotation.objects.create(
            page=1,
            raw_text="Async annotation",
            document=cls.doc,
            corpus=cls.corpus,
            creator=cls.user,
        )

    # ------------------------------------------------------------------
    # New async tests for annotation duplication helper - why separate class?
    # Why indeed... some deep dark async f*ckery going on here.
    # ------------------------------------------------------------------

    async def test_aduplicate_annotations_with_label(self):
        """Async duplication should mirror sync behaviour."""

        new_ids = await aduplicate_annotations_with_label(
            [self.annotation.id],
            new_label_text="AsyncNewLabel",
            creator_id=self.user.id,
        )

        self.assertEqual(len(new_ids), 1)

        # Pull related objects in a single DB round-trip so attribute access
        # below doesn't trigger additional (sync-only) queries.
        new_ann = await Annotation.objects.select_related("annotation_label").aget(
            pk=new_ids[0]
        )

        # corpus should now have label_set populated
        corpus_refresh = await Corpus.objects.select_related("label_set").aget(
            pk=self.corpus.id
        )
        self.assertIsNotNone(corpus_refresh.label_set)

        self.assertIsNotNone(new_ann.annotation_label)
        self.assertEqual(new_ann.annotation_label.text, "AsyncNewLabel")
        self.assertEqual(new_ann.creator_id, self.user.id)


class AsyncTestLLMTools(TestCase):
    """Separate test class for async tests to avoid database connection issues."""

    @classmethod
    def setUpClass(cls):
        """Set up test data."""
        super().setUpClass()

        cls.user = User.objects.create_user(username="testuser_async", password="12345")

        # Create a test document with txt extract file
        cls.doc = Document.objects.create(
            creator=cls.user,
            title="Async Test Document",
            description="Test Description",
        )

        # Create mock txt extract content and file
        cls.txt_content = (
            "This is test text extract content for async document analysis."
        )
        cls.doc.txt_extract_file.save(
            "test_extract_async.txt", ContentFile(cls.txt_content.encode())
        )

        cls.corpus = Corpus.objects.create(
            title="Async Corpus",
            creator=cls.user,
        )

        cls.annotation = Annotation.objects.create(
            page=1,
            raw_text="Async annotation",
            document=cls.doc,
            corpus=cls.corpus,
            creator=cls.user,
        )

    # ------------------------------------------------------------------
    # NEW: Make sure the mock extract lives inside the *current* MEDIA_ROOT
    # assigned by pytest-django for this particular test function.
    # Pytest-django rewrites settings.MEDIA_ROOT for every test; when the
    # file is only written once in setUpClass it ends up inside the first
    # tmp directory, breaking subsequent tests that run with a different
    # MEDIA_ROOT.  Re-sync the file at the start of every test to guarantee
    # it exists where Django expects it.
    # ------------------------------------------------------------------

    def setUp(self):  # noqa: D401 – simple helper, not public API
        """Ensure txt_extract_file exists in the active MEDIA_ROOT."""
        # Refresh the document to obtain a clean instance for the current DB
        # transaction.
        self.doc.refresh_from_db()

        from django.core.files.base import ContentFile

        # When pytest-django swaps MEDIA_ROOT the underlying file might no
        # longer be present at the path derived from self.doc.txt_extract_file
        # even though the field *name* itself remains unchanged. Re-create the
        # file when missing so IO in the actual test does not raise.
        storage = self.doc.txt_extract_file.storage
        if not storage.exists(self.doc.txt_extract_file.name):
            self.doc.txt_extract_file.save(
                "test_extract_async.txt",
                ContentFile(self.txt_content.encode()),
            )

    async def test_aload_document_txt_extract_success(self):
        """Async version should load full extract correctly."""
        result = await aload_document_txt_extract(self.doc.id)
        self.assertEqual(result, self.txt_content)

    async def test_aload_document_txt_extract_with_slice(self):
        """Async version should support slicing."""
        result = await aload_document_txt_extract(self.doc.id, start=5, end=15)
        self.assertEqual(result, self.txt_content[5:15])


class AsyncTestUpdateCorpusDescription(TransactionTestCase):
    """Async tests ensuring :func:`aupdate_corpus_description` behaves correctly."""

    def setUp(self):  # noqa: D401 – simple helper, not public API
        """Prepare a fresh corpus with an initial markdown description for every test."""
        self.user = User.objects.create_user(
            username="async_corpus_user", password="pw"
        )
        self.corpus = Corpus.objects.create(title="Async Corpus", creator=self.user)

        # Initialise with a first markdown description (version 1).
        self.initial_md = "# Corpus\n\nInitial description"
        update_corpus_description(
            corpus_id=self.corpus.id,
            new_content=self.initial_md,
            author_id=self.user.id,
        )

    # ------------------------------------------------------------------
    # Success paths
    # ------------------------------------------------------------------

    async def test_aupdate_with_new_content_creates_revision(self):
        """Supplying *new_content* should create a new revision and update the file."""
        new_content = "# Corpus\n\nUpdated description v2"
        revision = await aupdate_corpus_description(
            corpus_id=self.corpus.id,
            new_content=new_content,
            author_id=self.user.id,
        )

        # A revision is returned with incremented version.
        self.assertIsNotNone(revision)
        self.assertEqual(revision.version, 2)

        # The corpus markdown content now matches *new_content*.
        latest_content = await aget_corpus_description(self.corpus.id)
        self.assertEqual(latest_content, new_content)

    async def test_aupdate_with_diff_text_creates_revision(self):
        """Providing *diff_text* instead of full content should also work."""
        import difflib

        current = await aget_corpus_description(self.corpus.id)
        new_content = current + "\nAnother line appended."  # simple change

        diff_text = "".join(
            difflib.ndiff(
                current.splitlines(keepends=True), new_content.splitlines(keepends=True)
            )
        )

        revision = await aupdate_corpus_description(
            corpus_id=self.corpus.id,
            diff_text=diff_text,
            author_id=self.user.id,
        )

        self.assertIsNotNone(revision)
        self.assertEqual(revision.version, 2)
        latest_content = await aget_corpus_description(self.corpus.id)
        self.assertIn("Another line appended.", latest_content)

    async def test_aupdate_no_change_returns_none(self):
        """Supplying identical content should early-exit and return *None*."""
        result = await aupdate_corpus_description(
            corpus_id=self.corpus.id,
            new_content=self.initial_md,
            author_id=self.user.id,
        )
        self.assertIsNone(result)

    # ------------------------------------------------------------------
    # Failure / validation paths
    # ------------------------------------------------------------------

    async def test_aupdate_missing_content_raises(self):
        """Neither *new_content* nor *diff_text* provided – expect ``ValueError``."""
        with self.assertRaisesRegex(
            ValueError, "Provide either new_content or diff_text"
        ):
            await aupdate_corpus_description(
                corpus_id=self.corpus.id,
                author_id=self.user.id,
            )

    async def test_aupdate_both_content_and_diff_raise(self):
        """Supplying both *new_content* and *diff_text* is forbidden."""
        with self.assertRaisesRegex(
            ValueError, "Provide only one of new_content or diff_text"
        ):
            await aupdate_corpus_description(
                corpus_id=self.corpus.id,
                new_content="foo",
                diff_text="bar",
                author_id=self.user.id,
            )

    async def test_aupdate_missing_author_raises(self):
        """Author information is mandatory."""
        with self.assertRaisesRegex(ValueError, "Provide either author or author_id"):
            await aupdate_corpus_description(
                corpus_id=self.corpus.id,
                new_content="foo",
            )

    async def test_aupdate_invalid_corpus_raises(self):
        """Non-existent corpus id should raise a clear ``ValueError``."""
        with self.assertRaisesRegex(ValueError, "Corpus with id=999999 does not exist"):
            await aupdate_corpus_description(
                corpus_id=999999,
                new_content="foo",
                author_id=self.user.id,
            )

    # ------------------------------------------------------------------
    # Additional coverage paths
    # ------------------------------------------------------------------

    async def test_aupdate_with_author_object(self):
        """Passing author object directly should work."""
        new_content = "# Corpus\n\nUpdated with author object"
        revision = await aupdate_corpus_description(
            corpus_id=self.corpus.id,
            new_content=new_content,
            author=self.user,  # Pass user object instead of ID
        )

        self.assertIsNotNone(revision)
        self.assertEqual(revision.author, self.user)

    async def test_aupdate_snapshot_interval(self):
        """Test snapshot creation at interval boundaries."""
        # Create revisions 2-9 (version 1 already exists from setUp)
        for i in range(2, 10):
            await aupdate_corpus_description(
                corpus_id=self.corpus.id,
                new_content=f"# Corpus\n\nVersion {i}",
                author_id=self.user.id,
            )

        # Version 10 should trigger a snapshot
        final_content = "# Corpus\n\nVersion 10 with snapshot"
        revision = await aupdate_corpus_description(
            corpus_id=self.corpus.id,
            new_content=final_content,
            author_id=self.user.id,
        )

        self.assertEqual(revision.version, 10)
        self.assertIsNotNone(revision.snapshot)
        self.assertEqual(revision.snapshot, final_content)


class AsyncTestUpdateDocumentNote(TransactionTestCase):
    """Async tests ensuring :func:`aupdate_document_note` behaves correctly."""

    def setUp(self):  # noqa: D401 – simple helper, not public API
        """Prepare a fresh note with initial content for every test."""
        self.user = User.objects.create_user(username="async_note_user", password="pw")
        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Document for Notes",
            description="Test Description",
        )

        # Create initial note
        self.note = Note.objects.create(
            document=self.doc,
            title="Test Note",
            content="Initial note content",
            creator=self.user,
        )

    async def _get_note_async(self, note_id):
        """Helper to fetch a note asynchronously."""
        from channels.db import database_sync_to_async

        return await database_sync_to_async(Note.objects.get)(pk=note_id)

    # ------------------------------------------------------------------
    # Success paths
    # ------------------------------------------------------------------

    async def test_aupdate_note_with_new_content_creates_revision(self):
        """Supplying *new_content* should create a new revision and update the note."""
        new_content = "Updated note content version 2"
        revision = await aupdate_document_note(
            note_id=self.note.id,
            new_content=new_content,
            author_id=self.user.id,
        )

        # A revision is returned with incremented version.
        self.assertIsNotNone(revision)
        self.assertEqual(revision.version, 2)  # First update after initial creation

        # The note content is updated - fetch asynchronously
        note = await self._get_note_async(self.note.id)
        self.assertEqual(note.content, new_content)

    async def test_aupdate_note_with_diff_text_creates_revision(self):
        """Providing *diff_text* instead of full content should also work."""
        import difflib

        original_content = self.note.content
        new_content = original_content + "\nAnother paragraph added."

        diff_text = "".join(
            difflib.ndiff(
                original_content.splitlines(keepends=True),
                new_content.splitlines(keepends=True),
            )
        )

        revision = await aupdate_document_note(
            note_id=self.note.id,
            diff_text=diff_text,
            author_id=self.user.id,
        )

        self.assertIsNotNone(revision)
        self.assertEqual(revision.version, 2)

        # Fetch note asynchronously
        note = await self._get_note_async(self.note.id)
        self.assertIn("Another paragraph added.", note.content)

    async def test_aupdate_note_no_change_returns_none(self):
        """Supplying identical content should early-exit and return *None*."""
        result = await aupdate_document_note(
            note_id=self.note.id,
            new_content=self.note.content,
            author_id=self.user.id,
        )
        self.assertIsNone(result)

    async def test_aupdate_note_tracks_author(self):
        """The revision should track the author who made the change."""
        revision = await aupdate_document_note(
            note_id=self.note.id,
            new_content="Content changed by specific author",
            author_id=self.user.id,
        )

        self.assertEqual(revision.author_id, self.user.id)

    async def test_aupdate_note_snapshot_interval(self):
        """Test snapshot creation at interval boundaries (every 10 revisions)."""
        # Note already has version 1 from creation
        # Create revisions 2-9
        for i in range(2, 10):
            await aupdate_document_note(
                note_id=self.note.id,
                new_content=f"Note version {i}",
                author_id=self.user.id,
            )

        # Version 10 should trigger a snapshot
        final_content = "Note version 10 with snapshot"
        revision = await aupdate_document_note(
            note_id=self.note.id,
            new_content=final_content,
            author_id=self.user.id,
        )

        self.assertEqual(revision.version, 10)
        self.assertIsNotNone(revision.snapshot)
        self.assertEqual(revision.snapshot, final_content)

    async def test_aupdate_note_stores_checksums(self):
        """Revisions should store SHA-256 checksums of base and full content."""
        import hashlib

        original_content = self.note.content
        new_content = "Content with verifiable checksums"

        revision = await aupdate_document_note(
            note_id=self.note.id,
            new_content=new_content,
            author_id=self.user.id,
        )

        expected_base_checksum = hashlib.sha256(original_content.encode()).hexdigest()
        expected_full_checksum = hashlib.sha256(new_content.encode()).hexdigest()

        self.assertEqual(revision.checksum_base, expected_base_checksum)
        self.assertEqual(revision.checksum_full, expected_full_checksum)

    # ------------------------------------------------------------------
    # Failure / validation paths
    # ------------------------------------------------------------------

    async def test_aupdate_note_missing_content_raises(self):
        """Neither *new_content* nor *diff_text* provided – expect ``ValueError``."""
        with self.assertRaisesRegex(
            ValueError, "Provide either new_content or diff_text"
        ):
            await aupdate_document_note(
                note_id=self.note.id,
                author_id=self.user.id,
            )

    async def test_aupdate_note_both_content_and_diff_raise(self):
        """Supplying both *new_content* and *diff_text* is forbidden."""
        with self.assertRaisesRegex(
            ValueError, "Provide only one of new_content or diff_text"
        ):
            await aupdate_document_note(
                note_id=self.note.id,
                new_content="foo",
                diff_text="bar",
                author_id=self.user.id,
            )

    async def test_aupdate_note_invalid_note_raises(self):
        """Non-existent note id should raise a clear ``ValueError``."""
        with self.assertRaisesRegex(ValueError, "Note with id=999999 does not exist"):
            await aupdate_document_note(
                note_id=999999,
                new_content="foo",
                author_id=self.user.id,
            )

    async def test_aupdate_note_preserves_diff_in_revision(self):
        """The revision should store a proper unified diff."""
        original_content = self.note.content
        new_content = "Completely different content"

        revision = await aupdate_document_note(
            note_id=self.note.id,
            new_content=new_content,
            author_id=self.user.id,
        )

        # The diff should contain both old and new content indicators
        self.assertIn("-", revision.diff)  # Removed lines
        self.assertIn("+", revision.diff)  # Added lines
        self.assertIn(original_content, revision.diff)
        self.assertIn(new_content, revision.diff)
