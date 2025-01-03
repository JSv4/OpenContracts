import json
from unittest.mock import patch

from opencontractserver.annotations.models import Annotation
from opencontractserver.tasks.data_extract_tasks import annotation_window, text_search
from opencontractserver.tests.base import BaseFixtureTestCase
from opencontractserver.types.dicts import PawlsTokenPythonType


def create_mock_pawls_content(text: str) -> str:
    """Create a mock PAWLS parse file content with the given text."""
    words = text.split()
    tokens: list[PawlsTokenPythonType] = []
    x_pos = 0
    for word in words:
        token: PawlsTokenPythonType = {
            "x": x_pos,
            "y": 0,
            "width": len(word) * 10,  # Rough approximation
            "height": 10,
            "text": word,
        }
        tokens.append(token)
        x_pos += len(word) * 10 + 5  # Add space between words

    pawls_content = [
        {"page": {"width": 800, "height": 1000, "index": 1}, "tokens": tokens}
    ]
    return json.dumps(pawls_content)


class TestDataExtractTasks(BaseFixtureTestCase):
    """Test cases for data extraction task functions."""

    # The PDF content used in the fixture
    pdf_content = "This is a test document with some sample text ..."

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_text_search_finds_structural_annotations(self, mock_exists):
        """Test that text_search finds structural annotations containing the query."""
        mock_exists.return_value = True
        result = text_search(self.pdf_doc.id, "test structural")
        self.assertIn("This is a test structural annotation", result)
        self.assertIn("Another test structural annotation", result)

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_text_search_case_insensitive(self, mock_exists):
        """Test that text_search is case insensitive."""
        mock_exists.return_value = True
        result = text_search(self.pdf_doc.id, "TEST STRUCTURAL")
        self.assertIn("This is a test structural annotation", result)

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_text_search_no_matches(self, mock_exists):
        """Test text_search when no matches are found."""
        mock_exists.return_value = True
        result = text_search(self.pdf_doc.id, "nonexistent text")
        self.assertEqual(result, "No structural annotations matched your text_search.")

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_text_search_limit_three_results(self, mock_exists):
        """Test that text_search returns at most 3 results."""
        mock_exists.return_value = True
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

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_annotation_window_pdf(self, mock_exists):
        """
        Patch open() so that reading doc.pawls_parse_file.path gives us valid JSON
        from create_mock_pawls_content, enabling JSON parsing and text snippet retrieval.
        """
        mock_exists.return_value = True
        pawls_json = create_mock_pawls_content(self.pdf_content)

        with patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = pawls_json
            result = annotation_window(
                self.pdf_doc.id, str(self.pdf_annotation.id), "5"
            )

            self.assertIsNotNone(result)
            # We expect 'test document with some' in snippet
            self.assertIn("test document with some", result)
            # Possibly also expect words before/after if the window is big enough
            self.assertIn("This is a test document", result)

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_annotation_window_text(self, mock_exists):
        """
        The doc's text is now 'Test text annotation' (which is 19 chars long).
        So annotation_window should slice [0:19].
        """
        mock_exists.return_value = True

        with patch("builtins.open", create=True) as mock_open:
            # Return the same text that we stored in setUp
            mock_open.return_value.__enter__.return_value.read.return_value = (
                "Test text annotation"
            )
            result = annotation_window(
                self.txt_doc.id, str(self.txt_annotation.id), "5"
            )

            self.assertIsNotNone(result)
            # Now it should indeed contain the raw_text
            self.assertIn("Test text annotation", result)

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_annotation_window_invalid_window_size(self, mock_exists):
        """Test annotation_window with invalid window size."""
        mock_exists.return_value = True
        result = annotation_window(
            self.pdf_doc.id, str(self.pdf_annotation.id), "invalid"
        )
        self.assertEqual(result, "Error: Could not parse window_size as an integer.")

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_annotation_window_nonexistent_annotation(self, mock_exists):
        """Test annotation_window with nonexistent annotation ID."""
        mock_exists.return_value = True
        result = annotation_window(self.pdf_doc.id, "99999", "5")
        self.assertEqual(result, "Error: Annotation [99999] not found.")

    @patch("opencontractserver.tasks.data_extract_tasks.os.path.exists")
    def test_annotation_window_size_limit(self, mock_exists):
        """Test that annotation_window respects the maximum window size."""
        mock_exists.return_value = True
        # Create a long text with 2000 words
        long_text = " ".join(["word"] * 2000)
        with patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = long_text
            result = annotation_window(
                self.pdf_doc.id, str(self.pdf_annotation.id), "1000"
            )
            # Should be clamped to 500 words on each side
            self.assertIsNotNone(result)
            # Count words in result
            word_count = len(result.split())
            self.assertLessEqual(word_count, 1000)
