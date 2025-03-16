from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.pipeline.base.embedder import BaseEmbedder

User = get_user_model()

class TestEmbedder(BaseEmbedder):
    """
    A test embedder for unit testing.
    """
    title = "Test Embedder"
    description = "A test embedder for unit testing."
    author = "Test Author"
    dependencies = []
    vector_size = 768
    
    def embed_text(self, text: str, **kwargs) -> list[float]:
        """Return a dummy embedding vector."""
        return [0.1] * self.vector_size


class CorpusEmbeddingsTestCase(TestCase):
    """Test cases for the Corpus model's get_embeddings functionality."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.test_text = "This is a test text for embedding."

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    def test_get_embeddings_with_preferred_embedder(self, mock_get_component):
        """Test get_embeddings when the corpus has a preferred embedder."""
        # Set up the corpus with a preferred embedder
        embedder_path = "path.to.TestEmbedder"
        self.corpus.preferred_embedder = embedder_path
        self.corpus.save()
        
        # Mock the component lookup
        mock_get_component.return_value = TestEmbedder
        
        # Call the function
        embedder_name, embeddings = self.corpus.get_embeddings(self.test_text)
        
        # Verify results
        self.assertEqual(embedder_name, embedder_path)
        self.assertEqual(len(embeddings), 768)  # TestEmbedder's vector_size
        self.assertEqual(embeddings, [0.1] * 768)
        mock_get_component.assert_called_with(embedder_path)

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embeddings_with_default_embedder(self, mock_get_default):
        """Test get_embeddings when the corpus has no preferred embedder."""
        # Ensure corpus has no preferred embedder
        self.corpus.preferred_embedder = None
        self.corpus.save()
        
        # Mock the default embedder
        mock_get_default.return_value = TestEmbedder
        
        # Call the function
        embedder_name, embeddings = self.corpus.get_embeddings(self.test_text)
        
        # Verify results
        self.assertEqual(embedder_name, settings.DEFAULT_EMBEDDER)
        self.assertEqual(len(embeddings), 768)
        self.assertEqual(embeddings, [0.1] * 768)
        mock_get_default.assert_called_once()

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embeddings_handles_errors(self, mock_get_default, mock_get_component):
        """Test that get_embeddings handles errors gracefully."""
        # Set up the corpus with a preferred embedder
        embedder_path = "path.to.NonExistentEmbedder"
        self.corpus.preferred_embedder = embedder_path
        self.corpus.save()
        
        # Mock the component lookup to raise an exception
        mock_get_component.side_effect = ImportError("Module not found")
        mock_get_default.side_effect = ImportError("Default module not found")
        
        # Call the function
        embedder_name, embeddings = self.corpus.get_embeddings(self.test_text)
        
        # Verify results - embedder_name should be None since both preferred and default failed
        self.assertIsNone(embedder_name)
        self.assertIsNone(embeddings)
        mock_get_component.assert_called_with(embedder_path)

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    def test_get_embeddings_embedder_returns_none(self, mock_get_component):
        """Test that get_embeddings handles the case where embedder.embed_text returns None."""
        # Set up the corpus with a preferred embedder
        embedder_path = "path.to.TestEmbedder"
        self.corpus.preferred_embedder = embedder_path
        self.corpus.save()
        
        # Create a mock embedder that returns None
        mock_embedder = MagicMock(spec=BaseEmbedder)
        mock_embedder.embed_text.return_value = None
        
        # Mock the component lookup
        class MockEmbedderClass:
            def __new__(cls, *args, **kwargs):
                return mock_embedder
        
        mock_get_component.return_value = MockEmbedderClass
        
        # Call the function
        embedder_name, embeddings = self.corpus.get_embeddings(self.test_text)
        
        # Verify results
        self.assertEqual(embedder_name, embedder_path)
        self.assertIsNone(embeddings)
        mock_embedder.embed_text.assert_called_with(self.test_text) 