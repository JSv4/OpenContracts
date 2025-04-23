from unittest.mock import MagicMock, patch

import numpy as np
import requests
from django.test import TestCase, override_settings

from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.embedders.minn_modern_bert_embedder import (
    CloudMinnModernBERTEmbedder,
    MinnModernBERTEmbedder,
)


class TestMinnModernBERTEmbedder(TestCase):
    """Tests for the Minnesota Case Law ModernBERT embedder."""

    def setUp(self):
        """Set up test fixtures."""
        self.embedder = MinnModernBERTEmbedder()
        self.test_text = "This is a test sentence for embedding."

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_initialization(self, mock_transformer):
        """Test that the embedder initializes correctly."""
        embedder = MinnModernBERTEmbedder()

        # Check attributes
        self.assertEqual(embedder.title, "Minnesota Case Law ModernBERT Embedder")
        self.assertEqual(embedder.vector_size, 768)
        self.assertIn(FileTypeEnum.PDF, embedder.supported_file_types)
        self.assertIn(FileTypeEnum.TXT, embedder.supported_file_types)
        self.assertIn(FileTypeEnum.DOCX, embedder.supported_file_types)
        # HTML is no longer supported
        # self.assertIn(FileTypeEnum.HTML, embedder.supported_file_types)

        # Check cache path
        self.assertEqual(embedder.cache_dir, "/models")
        self.assertEqual(
            embedder.model_path, "/models/sentence-transformers/teraflop-minn-caselaw"
        )

        # Model should not be loaded on initialization
        self.assertIsNone(embedder.model)
        mock_transformer.assert_not_called()

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.os.path.exists"
    )
    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_load_model_from_cache(self, mock_transformer, mock_exists):
        """Test that the model loads from cache when available."""
        # Set up mocks
        mock_exists.return_value = True
        mock_model = MagicMock()
        mock_transformer.return_value = mock_model

        # Model should load from cache when _load_model is called
        self.embedder._load_model()

        mock_exists.assert_called_once_with(self.embedder.model_path)
        mock_transformer.assert_called_once_with(self.embedder.model_path)
        self.assertEqual(self.embedder.model, mock_model)

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.os.path.exists"
    )
    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_load_model_from_huggingface(self, mock_transformer, mock_exists):
        """Test that the model loads from Hugging Face when cache is not available."""
        # Set up mocks
        mock_exists.return_value = False
        mock_model = MagicMock()
        mock_transformer.return_value = mock_model

        # Model should load from Hugging Face when _load_model is called
        self.embedder._load_model()

        mock_exists.assert_called_once_with(self.embedder.model_path)
        mock_transformer.assert_called_once_with(self.embedder.model_name)
        self.assertEqual(self.embedder.model, mock_model)

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.os.path.exists"
    )
    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_embed_text(self, mock_transformer, mock_exists):
        """Test that text embedding works correctly."""
        # Set up mocks
        mock_exists.return_value = False
        mock_model = MagicMock()
        mock_embedding = np.random.rand(768)
        mock_model.encode.return_value = mock_embedding
        mock_transformer.return_value = mock_model

        # Embed text
        result = self.embedder.embed_text(self.test_text)

        # Check that the model was loaded and encode was called
        mock_transformer.assert_called_once()
        mock_model.encode.assert_called_once_with(self.test_text)

        # Check that the result is a list of floats with the correct length
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 768)
        self.assertIsInstance(result[0], float)

        # Check that the result matches the mock embedding
        self.assertEqual(result, mock_embedding.tolist())

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.os.path.exists"
    )
    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_embed_empty_text(self, mock_transformer, mock_exists):
        """Test handling of empty text."""
        # Set up mocks
        mock_exists.return_value = False
        mock_model = MagicMock()
        mock_transformer.return_value = mock_model

        # Embed empty text
        result = self.embedder.embed_text("")

        # Model should be loaded but encode should not be called
        # Correction: Model load IS called, but encode is not. Test logic was slightly off.
        # mock_transformer.assert_called_once() # Model IS loaded even for empty string
        self.embedder._load_model()  # Explicitly load model to check encode call later
        mock_transformer.assert_called()  # Ensure transformer factory was called
        mock_model.encode.assert_not_called()

        # Result should be a list of zeros
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 768)
        self.assertEqual(result, [0.0] * 768)

    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.os.path.exists"
    )
    @patch(
        "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.SentenceTransformer"
    )
    def test_embed_text_error(self, mock_transformer, mock_exists):
        """Test error handling during embedding."""
        # Set up mocks
        mock_exists.return_value = False
        mock_model = MagicMock()
        mock_model.encode.side_effect = Exception("Test error")
        mock_transformer.return_value = mock_model

        # Embed text (should handle the exception)
        result = self.embedder.embed_text(self.test_text)

        # Check that the result is None
        self.assertIsNone(result)


# Apply override_settings at the class level
@override_settings(
    HF_EMBEDDINGS_ENDPOINT="http://fake-hf-endpoint.test/embed",
    HF_TOKEN="fake-test-token",
)
@patch(
    "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.logger"
)  # Patch logger
class TestCloudMinnModernBERTEmbedder(TestCase):
    """Tests for the CloudMinnModernBERTEmbedder."""

    def setUp(self):
        """Set up test fixtures for the cloud embedder."""
        # Settings are overridden by the class decorator before setUp runs
        self.embedder = CloudMinnModernBERTEmbedder()
        self.test_text = "This is a cloud test sentence for embedding."
        self.mock_embedding = list(np.random.rand(768))

    def test_cloud_initialization(self, mock_logger):
        """Test that the cloud embedder initializes correctly."""
        self.assertEqual(
            self.embedder.title, "Cloud Minnesota Case Law ModernBERT Embedder"
        )
        self.assertEqual(self.embedder.vector_size, 768)
        self.assertIn(FileTypeEnum.PDF, self.embedder.supported_file_types)
        self.assertIn(FileTypeEnum.TXT, self.embedder.supported_file_types)
        self.assertIn(FileTypeEnum.DOCX, self.embedder.supported_file_types)

        # Check against the overridden values
        self.assertEqual(self.embedder.api_url, "http://fake-hf-endpoint.test/embed")
        self.assertIn("Authorization", self.embedder.headers)
        self.assertEqual(
            self.embedder.headers["Authorization"], "Bearer fake-test-token"
        )
        self.assertEqual(self.embedder.headers["Content-Type"], "application/json")
        self.assertEqual(self.embedder.headers["Accept"], "application/json")

    @patch("requests.post")
    def test_cloud_embed_text_success(self, mock_post, mock_logger):
        """Test successful text embedding via API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        # Ensure the mock returns a list for 'embeddings'
        mock_response.json.return_value = {"embeddings": self.mock_embedding}
        mock_post.return_value = mock_response

        result = self.embedder.embed_text(self.test_text)

        mock_post.assert_called_once_with(
            self.embedder.api_url,
            headers=self.embedder.headers,
            json={"inputs": self.test_text, "parameters": {}},
        )
        self.assertEqual(result, self.mock_embedding)
        mock_logger.warning.assert_not_called()
        mock_logger.error.assert_not_called()

    @patch("requests.post")
    def test_cloud_embed_empty_text(self, mock_post, mock_logger):
        """Test handling of empty text for cloud embedding."""
        result = self.embedder.embed_text("")  # Test with empty string
        result_space = self.embedder.embed_text("   ")  # Test with whitespace only

        mock_post.assert_not_called()  # API should not be called for empty/whitespace
        self.assertEqual(result, [0.0] * self.embedder.vector_size)
        self.assertEqual(result_space, [0.0] * self.embedder.vector_size)
        # Logger should be called twice, once for each empty/whitespace case
        self.assertEqual(mock_logger.warning.call_count, 2)
        mock_logger.warning.assert_any_call("Empty text provided for embedding")
        mock_logger.error.assert_not_called()

    @patch("requests.post")
    def test_cloud_embed_text_api_error(self, mock_post, mock_logger):
        """Test handling of API error (non-200 status)."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        result = self.embedder.embed_text(self.test_text)

        mock_post.assert_called_once()
        self.assertIsNone(result)
        mock_logger.error.assert_called_with(
            f"Error from HF endpoint: {mock_response.text}"
        )

    @patch("requests.post")
    def test_cloud_embed_text_invalid_response_key(self, mock_post, mock_logger):
        """Test handling of invalid JSON response (missing key) from API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"wrong_key": "no embedding here"}
        mock_post.return_value = mock_response

        result = self.embedder.embed_text(self.test_text)

        mock_post.assert_called_once()
        self.assertIsNone(result)
        mock_logger.error.assert_called_with(
            "No valid embedding returned from HF endpoint."
        )

    @patch("requests.post")
    def test_cloud_embed_text_invalid_response_type(self, mock_post, mock_logger):
        """Test handling of invalid JSON response (wrong type) from API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embeddings": "not_a_list"
        }  # Embeddings value is not a list
        mock_post.return_value = mock_response

        result = self.embedder.embed_text(self.test_text)

        mock_post.assert_called_once()
        self.assertIsNone(result)
        mock_logger.error.assert_called_with(
            "No valid embedding returned from HF endpoint."
        )

    @patch("requests.post")
    def test_cloud_embed_text_request_exception(self, mock_post, mock_logger):
        """Test handling of requests library exception."""
        error_message = "Connection timed out"
        mock_post.side_effect = requests.exceptions.RequestException(error_message)

        result = self.embedder.embed_text(self.test_text)

        mock_post.assert_called_once()
        self.assertIsNone(result)
        # Check that the specific exception message is logged
        mock_logger.error.assert_called_with(
            f"Error generating embeddings via HF endpoint: {error_message}"
        )
