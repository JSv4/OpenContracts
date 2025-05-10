import json
from unittest.mock import MagicMock, patch

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.docling_parser_rest import DoclingParser


class MockResponse:
    """Mock response object similar to requests.Response."""

    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self.json_data = json_data
        self.text = json.dumps(json_data)

    def json(self):
        return self.json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP Error: {self.status_code}")


class TestDoclingParser(TestCase):
    """Tests for the DoclingParser class."""

    def setUp(self):
        """Set up test environment."""
        # Create a sample Document object with a mock PDF file
        self.doc = Document.objects.create(
            title="Test Document", description="Test Description", file_type="pdf"
        )

        # Create a mock PDF file for the document
        pdf_content = b"%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Count 1/Kids[3 0 R]>>\nendobj\n3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer\n<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"  # noqa: E501
        self.doc.pdf_file.save("test.pdf", ContentFile(pdf_content))

        # Create an instance of DoclingParser
        self.parser = DoclingParser()

        # Sample response from the docling service
        self.sample_response = {
            "title": "Test Document",
            "content": "Sample document content",
            "description": "Test Description",
            "pawlsFileContent": [
                {
                    "page": {"width": 612, "height": 792, "index": 1},
                    "tokens": [
                        {
                            "x": 100,
                            "y": 100,
                            "width": 50,
                            "height": 20,
                            "text": "Sample",
                        }
                    ],
                }
            ],
            "pageCount": 1,
            "docLabels": [],
            "labelledText": [
                {
                    "id": "text-1",
                    "annotationLabel": "Paragraph",
                    "rawText": "Sample document content",
                    "page": 0,
                    "annotationJson": {
                        "0": {
                            "bounds": {
                                "left": 100,
                                "top": 100,
                                "right": 150,
                                "bottom": 120,
                            },
                            "tokensJsons": [{"pageIndex": 0, "tokenIndex": 0}],
                            "rawText": "Sample document content",
                        }
                    },
                    "parent_id": None,
                    "annotation_type": "TOKEN_LABEL",
                    "structural": True,
                }
            ],
            "relationships": [],
        }

    @patch("opencontractserver.pipeline.parsers.docling_parser_rest.requests.post")
    @patch(
        "opencontractserver.pipeline.parsers.docling_parser_rest.default_storage.open"
    )
    def test_parse_document_success(self, mock_open, mock_post):
        """Test successful document parsing."""
        # Mock the file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock the HTTP response
        mock_post.return_value = MockResponse(200, self.sample_response)

        # Call the parse_document method
        result = self.parser.parse_document(user_id=1, doc_id=self.doc.id)

        # Check that the result is not None
        self.assertIsNotNone(result)

        # Check that the result contains expected keys
        self.assertEqual(result["title"], "Test Document")
        self.assertEqual(result["content"], "Sample document content")
        self.assertEqual(result["page_count"], 1)

        # Check that labelledText was normalized to labelled_text
        self.assertIn("labelled_text", result)
        self.assertEqual(len(result["labelled_text"]), 1)

        # Verify correct request was made
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        self.assertEqual(call_kwargs["headers"]["Content-Type"], "application/json")

        # Verify payload has the correct structure
        payload = call_kwargs[
            "json"
        ]  # In requests.post, the json parameter is already a dict
        self.assertEqual(payload["filename"], "test.pdf")
        self.assertIn("pdf_base64", payload)
        self.assertFalse(payload["force_ocr"])
        self.assertFalse(payload["roll_up_groups"])
        self.assertFalse(payload["llm_enhanced_hierarchy"])

    @patch("opencontractserver.pipeline.parsers.docling_parser_rest.requests.post")
    @patch(
        "opencontractserver.pipeline.parsers.docling_parser_rest.default_storage.open"
    )
    def test_parse_document_service_error(self, mock_open, mock_post):
        """Test handling of service errors."""
        # Mock the file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock an error response
        mock_post.return_value = MockResponse(500, {"detail": "Internal server error"})
        mock_post.return_value.raise_for_status = MagicMock(
            side_effect=Exception("500 Server Error")
        )

        # Call the parse_document method
        result = self.parser.parse_document(user_id=1, doc_id=self.doc.id)

        # Check that the result is None when service fails
        self.assertIsNone(result)

    @override_settings(DOCLING_PARSER_SERVICE_URL="http://custom-host:9000/parse/")
    def test_custom_settings(self):
        """Test that custom settings are properly used."""
        parser = DoclingParser()
        self.assertEqual(parser.service_url, "http://custom-host:9000/parse/")

    def test_normalize_response(self):
        """Test the response normalization function."""
        # Create a response with camelCase keys
        camel_case_response = {
            "title": "Test",
            "pawlsFileContent": [{"page": {"width": 100}}],
            "pageCount": 2,
            "docLabels": [],
            "labelledText": [{"id": "1"}],
        }

        # Normalize the response
        normalized = self.parser._normalize_response(camel_case_response)

        # Check that both camelCase and snake_case keys are present
        self.assertIn("pawlsFileContent", normalized)
        self.assertIn("pawls_file_content", normalized)
        self.assertIn("pageCount", normalized)
        self.assertIn("page_count", normalized)
        self.assertIn("docLabels", normalized)
        self.assertIn("doc_labels", normalized)
        self.assertIn("labelledText", normalized)
        self.assertIn("labelled_text", normalized)

        # Check values
        self.assertEqual(normalized["page_count"], 2)
        self.assertEqual(normalized["pawls_file_content"][0]["page"]["width"], 100)
