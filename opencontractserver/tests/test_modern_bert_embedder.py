import unittest
from unittest.mock import patch, MagicMock

import numpy as np
import os

from opencontractserver.pipeline.embedders.modern_bert_embedder import ModernBERTEmbedder, ModernBERTEmbedder768
from opencontractserver.pipeline.base.file_types import FileTypeEnum


class TestModernBERTEmbedder(unittest.TestCase):
    """Tests for the ModernBERT embedder."""

    def setUp(self):
        """Set up test fixtures."""
        self.embedder = ModernBERTEmbedder()
        self.test_text = "This is a test sentence for embedding."

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
    def test_initialization(self, mock_transformer):
        """Test that the embedder initializes correctly."""
        embedder = ModernBERTEmbedder()
        
        # Check attributes
        self.assertEqual(embedder.title, "ModernBERT Embedder")
        self.assertEqual(embedder.vector_size, 768)
        self.assertIn(FileTypeEnum.PDF, embedder.supported_file_types)
        self.assertIn(FileTypeEnum.TXT, embedder.supported_file_types)
        self.assertIn(FileTypeEnum.DOCX, embedder.supported_file_types)
        self.assertIn(FileTypeEnum.HTML, embedder.supported_file_types)
        
        # Check cache path
        self.assertEqual(embedder.cache_dir, "/models")
        self.assertEqual(embedder.model_path, "/models/sentence-transformers/ModernBERT-base")
        
        # Model should not be loaded on initialization
        self.assertIsNone(embedder.model)
        mock_transformer.assert_not_called()

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.os.path.exists')
    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
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

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.os.path.exists')
    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
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

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.os.path.exists')
    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
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

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.os.path.exists')
    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
    def test_embed_empty_text(self, mock_transformer, mock_exists):
        """Test handling of empty text."""
        # Set up mocks
        mock_exists.return_value = False
        mock_model = MagicMock()
        mock_transformer.return_value = mock_model
        
        # Embed empty text
        result = self.embedder.embed_text("")
        
        # Model should be loaded but encode should not be called
        mock_transformer.assert_called_once()
        mock_model.encode.assert_not_called()
        
        # Result should be a list of zeros
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 768)
        self.assertEqual(result, [0.0] * 768)

    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.os.path.exists')
    @patch('opencontractserver.pipeline.embedders.modern_bert_embedder.SentenceTransformer')
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

    def test_modernbert_embedder_768(self):
        """Test the specialized 768-dimensional embedder."""
        embedder = ModernBERTEmbedder768()
        
        # Check attributes
        self.assertEqual(embedder.title, "ModernBERT Embedder (768d)")
        self.assertEqual(embedder.vector_size, 768)
        self.assertEqual(embedder.model_name, "answerdotai/ModernBERT-base")
        self.assertEqual(embedder.model_path, "/models/sentence-transformers/ModernBERT-base")


if __name__ == "__main__":
    unittest.main() 