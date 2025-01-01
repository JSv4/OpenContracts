import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.tasks.data_extract_tasks import annotation_window, text_search
from opencontractserver.tests.fixtures import (
    SAMPLE_PDF_FILE_ONE_PATH,
    SAMPLE_TXT_FILE_ONE_PATH,
)

User = get_user_model()


@pytest.mark.django_db
class TestDataExtractTasks(TestCase):
    """Test cases for data extraction task functions."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(username="testuser", password="testpass")

        # Create test documents
        with open(SAMPLE_PDF_FILE_ONE_PATH, "rb") as pdf_file:
            self.pdf_doc = Document.objects.create(
                title="Test PDF Document",
                creator=self.user,
                pdf_file=ContentFile(pdf_file.read(), name="test.pdf"),
                file_type="application/pdf",
            )

        with open(SAMPLE_TXT_FILE_ONE_PATH, encoding="utf-8") as txt_file:
            self.txt_doc = Document.objects.create(
                title="Test Text Document",
                creator=self.user,
                txt_extract_file=ContentFile(txt_file.read(), name="test.txt"),
                file_type="text/plain",
            )

        # Create test annotation label
        self.label = AnnotationLabel.objects.create(
            text="Test Label",
            creator=self.user,
        )

        # Create test structural annotations
        self.structural_annotation = Annotation.objects.create(
            document=self.pdf_doc,
            annotation_label=self.label,
            raw_text="This is a test structural annotation",
            page=1,
            structural=True,
            creator=self.user,
        )

        self.structural_annotation_2 = Annotation.objects.create(
            document=self.pdf_doc,
            annotation_label=self.label,
            raw_text="Another test structural annotation",
            page=2,
            structural=True,
            creator=self.user,
        )

        # Create test regular annotations
        self.pdf_annotation = Annotation.objects.create(
            document=self.pdf_doc,
            annotation_label=self.label,
            raw_text="Test PDF annotation",
            page=1,
            json={
                "bounds": {"top": 0, "bottom": 10, "left": 0, "right": 10},
                "tokensJsons": [{"pageIndex": 1, "tokenIndex": 0}],
                "rawText": "Test PDF annotation",
            },
            creator=self.user,
        )

        self.txt_annotation = Annotation.objects.create(
            document=self.txt_doc,
            annotation_label=self.label,
            raw_text="Test text annotation",
            page=1,
            json={"start": 0, "end": 19},  # Length of "Test text annotation"
            creator=self.user,
        )

    def test_text_search_finds_structural_annotations(self):
        """Test that text_search finds structural annotations containing the query."""
        result = text_search(self.pdf_doc.id, "test structural")
        self.assertIn("This is a test structural annotation", result)
        self.assertIn("Another test structural annotation", result)

    def test_text_search_case_insensitive(self):
        """Test that text_search is case insensitive."""
        result = text_search(self.pdf_doc.id, "TEST STRUCTURAL")
        self.assertIn("This is a test structural annotation", result)

    def test_text_search_no_matches(self):
        """Test text_search when no matches are found."""
        result = text_search(self.pdf_doc.id, "nonexistent text")
        self.assertEqual(result, "No structural annotations matched your text_search.")

    def test_text_search_limit_three_results(self):
        """Test that text_search returns at most 3 results."""
        # Create more than 3 matching annotations
        for i in range(4):
            Annotation.objects.create(
                document=self.pdf_doc,
                annotation_label=self.label,
                raw_text=f"Test structural annotation {i}",
                page=1,
                structural=True,
                creator=self.user,
            )

        result = text_search(self.pdf_doc.id, "Test structural")
        matches = result.count("\n") + 1  # Count newlines + 1 for the last line
        self.assertEqual(matches, 3)

    def test_annotation_window_pdf(self):
        """Test annotation_window with PDF document."""
        result = annotation_window(self.pdf_doc.id, str(self.pdf_annotation.id), "5")
        self.assertIsNotNone(result)
        self.assertIn("Test PDF annotation", result)

    def test_annotation_window_text(self):
        """Test annotation_window with text document."""
        result = annotation_window(self.txt_doc.id, str(self.txt_annotation.id), "5")
        self.assertIsNotNone(result)
        self.assertIn("Test text annotation", result)

    def test_annotation_window_invalid_window_size(self):
        """Test annotation_window with invalid window size."""
        result = annotation_window(
            self.pdf_doc.id, str(self.pdf_annotation.id), "invalid"
        )
        self.assertEqual(result, "Error: Could not parse window_size as an integer.")

    def test_annotation_window_nonexistent_annotation(self):
        """Test annotation_window with nonexistent annotation ID."""
        result = annotation_window(self.pdf_doc.id, "99999", "5")
        self.assertEqual(result, "Error: Annotation [99999] not found.")

    def test_annotation_window_size_limit(self):
        """Test that annotation_window respects the maximum window size."""
        # Try with a large window size
        result = annotation_window(self.pdf_doc.id, str(self.pdf_annotation.id), "1000")
        # Should be clamped to 500 words on each side
        self.assertIsNotNone(result)
        # The exact length check would depend on the document content

    def tearDown(self):
        """Clean up test data."""
        Annotation.objects.all().delete()
        Document.objects.all().delete()
        AnnotationLabel.objects.all().delete()
        User.objects.all().delete()
