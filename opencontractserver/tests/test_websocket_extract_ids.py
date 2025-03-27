"""
Tests for the extract_websocket_path_id function in the websocket utils.
"""
from django.test import TestCase

from config.websocket.utils.extract_ids import extract_websocket_path_id


class ExtractWebsocketPathIdTests(TestCase):
    """
    Tests for the extract_websocket_path_id function which extracts IDs from websocket paths.
    
    This function is crucial for the WebSocket consumers to correctly identify
    documents and corpora from the WebSocket URL paths.
    """

    def test_extract_document_id_standard_path(self):
        """Test extracting document_id from a standard document query path."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/query/"
        document_id = extract_websocket_path_id(path, "document")
        self.assertEqual(document_id, "RG9jdW1lbnRUeXBlOjE=")

    def test_extract_document_id_with_leading_slash(self):
        """Test extracting document_id with a leading slash in the path."""
        path = "/ws/document/RG9jdW1lbnRUeXBlOjE=/query/"
        document_id = extract_websocket_path_id(path, "document")
        self.assertEqual(document_id, "RG9jdW1lbnRUeXBlOjE=")

    def test_extract_document_id_with_corpus(self):
        """Test extracting document_id from a path that also contains a corpus_id."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/query/corpus/Q29ycHVzVHlwZToyMw==/"
        document_id = extract_websocket_path_id(path, "document")
        self.assertEqual(document_id, "RG9jdW1lbnRUeXBlOjE=")
    
    def test_extract_corpus_id_from_corpus_path(self):
        """Test extracting corpus_id from a standard corpus query path."""
        path = "ws/corpus/Q29ycHVzVHlwZToyMw==/query/"
        corpus_id = extract_websocket_path_id(path, "corpus")
        self.assertEqual(corpus_id, "Q29ycHVzVHlwZToyMw==")

    def test_extract_corpus_id_from_document_path(self):
        """Test extracting corpus_id from a document path that includes a corpus."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/query/corpus/Q29ycHVzVHlwZToyMw==/"
        corpus_id = extract_websocket_path_id(path, "corpus")
        self.assertEqual(corpus_id, "Q29ycHVzVHlwZToyMw==")

    def test_extract_corpus_id_with_leading_slash(self):
        """Test extracting corpus_id with a leading slash in the path."""
        path = "/ws/corpus/Q29ycHVzVHlwZToyMw==/query/"
        corpus_id = extract_websocket_path_id(path, "corpus")
        self.assertEqual(corpus_id, "Q29ycHVzVHlwZToyMw==")

    def test_extract_other_resource_type(self):
        """Test extracting an ID for a different resource type."""
        path = "ws/other_resource/T3RoZXJSZXNvdXJjZVR5cGU6NQ==/query/"
        resource_id = extract_websocket_path_id(path, "other_resource")
        self.assertEqual(resource_id, "T3RoZXJSZXNvdXJjZVR5cGU6NQ==")

    def test_invalid_document_path(self):
        """Test that an invalid document path raises a ValueError."""
        path = "ws/document/invalid/format"
        with self.assertRaises(ValueError):
            extract_websocket_path_id(path, "document")

    def test_invalid_corpus_path(self):
        """Test that an invalid corpus path raises a ValueError."""
        path = "ws/corpus/invalid/format"
        with self.assertRaises(ValueError):
            extract_websocket_path_id(path, "corpus")

    def test_invalid_document_with_corpus_path(self):
        """Test that an invalid document path with corpus raises a ValueError."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/invalid/corpus/Q29ycHVzVHlwZToyMw==/"
        with self.assertRaises(ValueError):
            extract_websocket_path_id(path, "document")

    def test_extract_corpus_id_from_invalid_document_path(self):
        """Test extracting corpus_id from an invalid document path raises ValueError."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/invalid/corpus/Q29ycHVzVHlwZToyMw==/"
        with self.assertRaises(ValueError):
            extract_websocket_path_id(path, "corpus")
            
    def test_other_resource_type_from_document_corpus_path(self):
        """Test extracting a different resource type from document+corpus path raises ValueError."""
        path = "ws/document/RG9jdW1lbnRUeXBlOjE=/query/corpus/Q29ycHVzVHlwZToyMw==/"
        with self.assertRaises(ValueError):
            extract_websocket_path_id(path, "other_resource") 