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
    """Test cases for the Corpus model's embed_text functionality."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.test_text = "This is a test text for embedding."

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("requests.post")
    def test_embed_text_with_preferred_embedder(self, mock_post, mock_get_component):
        """Test embed_text when the corpus has a preferred embedder."""
        # Set up the corpus with a preferred embedder
        embedder_path = "path.to.TestEmbedder"
        self.corpus.preferred_embedder = embedder_path
        self.corpus.save()

        # Mock the component lookup
        mock_get_component.return_value = TestEmbedder

        # Call the function
        embedder_name, embeddings = self.corpus.embed_text(self.test_text)

        # Verify results
        self.assertEqual(embedder_name, embedder_path)
        self.assertEqual(len(embeddings), 768)  # TestEmbedder's vector_size
        self.assertEqual(embeddings, [0.1] * 768)
        mock_get_component.assert_called_with(embedder_path)
        # The microservice should not be called if the embedder works
        mock_post.assert_not_called()

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    @patch("requests.post")
    @patch("opencontractserver.corpuses.models.generate_embeddings_from_text")
    def test_embed_text_with_default_embedder(
        self, mock_generate_embeddings, mock_post, mock_get_default
    ):
        """Test embed_text when the corpus has no preferred embedder."""
        # Ensure corpus has no preferred embedder
        self.corpus.preferred_embedder = None
        self.corpus.save()

        # Set up expected return values
        expected_embedder = settings.DEFAULT_EMBEDDER
        expected_embeddings = [0.1] * 768

        # Mock generate_embeddings_from_text to return our expected values
        mock_generate_embeddings.return_value = (expected_embedder, expected_embeddings)

        # Call the function
        embedder_name, embeddings = self.corpus.embed_text(self.test_text)

        # Verify results
        self.assertEqual(embedder_name, expected_embedder)
        self.assertEqual(len(embeddings), 768)
        self.assertEqual(embeddings, expected_embeddings)

        # Verify generate_embeddings_from_text was called with the right arguments
        mock_generate_embeddings.assert_called_with(
            self.test_text, corpus_id=self.corpus.pk
        )

        # The other mocks won't be called since we're mocking at a higher level

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    @patch("requests.post")
    @patch("opencontractserver.corpuses.models.generate_embeddings_from_text")
    def test_embed_text_handles_errors(
        self, mock_generate_embeddings, mock_post, mock_get_default, mock_get_component
    ):
        """Test that embed_text handles errors gracefully."""
        # Set up the corpus with a preferred embedder
        embedder_path = "path.to.NonExistentEmbedder"
        self.corpus.preferred_embedder = embedder_path
        self.corpus.save()

        # Mock generate_embeddings_from_text to return None, None (simulating all failures)
        mock_generate_embeddings.return_value = (None, None)

        # The error handlers in the other mocks won't be called because we're directly mocking the
        # generate_embeddings_from_text function at the highest level

        # Call the function
        embedder_name, embeddings = self.corpus.embed_text(self.test_text)

        # Verify results - embedder_name and embeddings should be None since everything failed
        self.assertIsNone(embedder_name)
        self.assertIsNone(embeddings)
        mock_generate_embeddings.assert_called_with(
            self.test_text, corpus_id=self.corpus.pk
        )
        # We don't need to verify mock_post or mock_get_component as they won't be called

    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("requests.post")
    def test_embed_text_embedder_returns_none(self, mock_post, mock_get_component):
        """Test that embed_text handles the case where embedder.embed_text returns None."""
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

        # We don't need to mock the microservice failure since it won't be called

        # Call the function
        embedder_name, embeddings = self.corpus.embed_text(self.test_text)

        # Verify results
        self.assertEqual(embedder_name, embedder_path)
        self.assertIsNone(embeddings)
        mock_embedder.embed_text.assert_called_with(self.test_text)
        # The microservice should NOT be called when embedder returns None
        mock_post.assert_not_called()
