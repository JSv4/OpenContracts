import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, TransactionTestCase

from opencontractserver.annotations.models import Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools import (
    get_md_summary_token_length,
    get_notes_for_document_corpus,
    load_document_md_summary,
)
from opencontractserver.llms.tools.core_tools import (
    _token_count,
    aload_document_txt_extract,
    load_document_txt_extract,
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


class AsyncTestLLMTools(TransactionTestCase):
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

    async def test_aload_document_txt_extract_success(self):
        """Async version should load full extract correctly."""
        result = await aload_document_txt_extract(self.doc.id)
        self.assertEqual(result, self.txt_content)

    async def test_aload_document_txt_extract_with_slice(self):
        """Async version should support slicing."""
        result = await aload_document_txt_extract(self.doc.id, start=5, end=15)
        self.assertEqual(result, self.txt_content[5:15])
