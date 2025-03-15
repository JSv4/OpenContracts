import unittest
from unittest.mock import patch, MagicMock

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.tasks.embeddings_task import get_embedder_for_corpus, store_embeddings


class TestEmbedder(BaseEmbedder):
    """
    A test embedder for unit testing.
    """
    title = "Test Embedder"
    description = "A test embedder for unit testing."
    author = "Test Author"
    dependencies = []
    vector_size = 128
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder384(BaseEmbedder):
    """
    A test embedder with 384-dimensional vectors.
    """
    title = "Test Embedder 384"
    description = "A test embedder with 384-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder768(BaseEmbedder):
    """
    A test embedder with 768-dimensional vectors.
    """
    title = "Test Embedder 768"
    description = "A test embedder with 768-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 768
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder1536(BaseEmbedder):
    """
    A test embedder with 1536-dimensional vectors.
    """
    title = "Test Embedder 1536"
    description = "A test embedder with 1536-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 1536
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder3072(BaseEmbedder):
    """
    A test embedder with 3072-dimensional vectors.
    """
    title = "Test Embedder 3072"
    description = "A test embedder with 3072-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 3072
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbeddingsTask(unittest.TestCase):
    """
    Tests for the embeddings task functions.
    """

    @patch('opencontractserver.tasks.embeddings_task.Corpus')
    @patch('opencontractserver.tasks.embeddings_task.get_component_by_name')
    @patch('opencontractserver.tasks.embeddings_task.find_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.tasks.embeddings_task.get_default_embedder')
    def test_get_embedder_for_corpus_with_preferred_embedder(
        self, mock_get_default, mock_find_embedder, mock_get_component, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when the corpus has a preferred embedder.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = "path.to.TestEmbedder"
        mock_corpus.objects.get.return_value = mock_corpus_obj
        
        # Mock the component lookup
        mock_get_component.return_value = TestEmbedder
        
        # Call the function
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id=1)
        
        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, "path.to.TestEmbedder")
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_get_component.assert_called_with("path.to.TestEmbedder")
        mock_find_embedder.assert_not_called()
        mock_get_default.assert_not_called()

    @patch('opencontractserver.tasks.embeddings_task.Corpus')
    @patch('opencontractserver.tasks.embeddings_task.find_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.tasks.embeddings_task.get_default_embedder')
    def test_get_embedder_for_corpus_with_mimetype(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when no preferred embedder but mimetype is provided.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = None
        mock_corpus.objects.get.return_value = mock_corpus_obj
        
        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder
        
        # Call the function
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id=1, mimetype_or_enum="application/pdf")
        
        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}")
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf", None)
        mock_get_default.assert_not_called()

    @patch('opencontractserver.tasks.embeddings_task.Corpus')
    @patch('opencontractserver.tasks.embeddings_task.get_component_by_name')
    @patch('opencontractserver.tasks.embeddings_task.find_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.tasks.embeddings_task.get_default_embedder')
    def test_get_embedder_for_corpus_with_error_loading_preferred(
        self, mock_get_default, mock_find_embedder, mock_get_component, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when there's an error loading the preferred embedder.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = "path.to.NonExistentEmbedder"
        mock_corpus.objects.get.return_value = mock_corpus_obj
        
        # Mock the component lookup to raise an exception
        mock_get_component.side_effect = Exception("Component not found")
        
        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder
        
        # Call the function
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id=1, mimetype_or_enum="application/pdf")
        
        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}")
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_get_component.assert_called_with("path.to.NonExistentEmbedder")
        mock_find_embedder.assert_called_with("application/pdf", None)
        mock_get_default.assert_not_called()

    @patch('opencontractserver.tasks.embeddings_task.Corpus')
    @patch('opencontractserver.tasks.embeddings_task.find_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.tasks.embeddings_task.get_default_embedder')
    def test_get_embedder_for_corpus_with_corpus_not_found(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when the corpus is not found.
        """
        # Set up mocks
        mock_corpus.objects.get.side_effect = Exception("Corpus not found")
        
        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder
        
        # Call the function
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id=1, mimetype_or_enum="application/pdf")
        
        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}")
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf", None)
        mock_get_default.assert_not_called()

    @patch('opencontractserver.tasks.embeddings_task.Corpus')
    @patch('opencontractserver.tasks.embeddings_task.find_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.tasks.embeddings_task.get_default_embedder')
    def test_get_embedder_for_corpus_fallback_to_default(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus fallback to default embedder.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = None
        mock_corpus.objects.get.return_value = mock_corpus_obj
        
        # Mock the embedder lookup to return None
        mock_find_embedder.return_value = None
        
        # Mock the default embedder
        mock_get_default.return_value = TestEmbedder
        
        # Call the function
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id=1, mimetype_or_enum="application/pdf")
        
        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}")
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf", None)
        mock_get_default.assert_called_once()

    @patch('opencontractserver.tasks.embeddings_task.Embedding')
    def test_store_embeddings(self, mock_embedding):
        """
        Test store_embeddings function.
        """
        # Set up mocks
        mock_embedding_instance = MagicMock()
        # Explicitly set vector fields to None
        mock_embedding_instance.vector_384 = None
        mock_embedding_instance.vector_768 = None
        mock_embedding_instance.vector_1536 = None
        mock_embedding_instance.vector_3072 = None
        mock_embedding.return_value = mock_embedding_instance
        
        # Create a test embedder
        embedder = TestEmbedder()
        
        # Call the function
        result = store_embeddings(embedder, "Test text", "path.to.TestEmbedder")
        
        # Verify the results
        self.assertEqual(result, mock_embedding_instance)
        mock_embedding.assert_called_with(embedder_path="path.to.TestEmbedder")
        mock_embedding_instance.save.assert_called_once()
        
        # Verify the embeddings were stored in the correct field
        self.assertIsNone(mock_embedding_instance.vector_384)
        self.assertIsNone(mock_embedding_instance.vector_768)
        self.assertIsNone(mock_embedding_instance.vector_1536)
        self.assertIsNone(mock_embedding_instance.vector_3072)
        
        # The test embedder has vector_size=128, which is not one of the standard sizes
        # So no vector field should be set

    @patch('opencontractserver.tasks.embeddings_task.Embedding')
    def test_store_embeddings_with_different_dimensions(self, mock_embedding):
        """
        Test store_embeddings function with different vector dimensions.
        """
        # Set up mocks
        mock_embedding_instance = MagicMock()
        # Explicitly set vector fields to None initially
        mock_embedding_instance.vector_384 = None
        mock_embedding_instance.vector_768 = None
        mock_embedding_instance.vector_1536 = None
        mock_embedding_instance.vector_3072 = None
        mock_embedding.return_value = mock_embedding_instance
        
        # Test with 384-dimensional embedder
        embedder_384 = TestEmbedder384()
        result_384 = store_embeddings(embedder_384, "Test text", "path.to.TestEmbedder384")
        self.assertEqual(result_384, mock_embedding_instance)
        mock_embedding_instance.save.assert_called()
        # Check that the vector was stored in the correct field
        self.assertIsNotNone(mock_embedding_instance.vector_384)
        self.assertIsNone(mock_embedding_instance.vector_768)
        self.assertIsNone(mock_embedding_instance.vector_1536)
        self.assertIsNone(mock_embedding_instance.vector_3072)
        
        # Reset mock
        mock_embedding_instance.reset_mock()
        mock_embedding_instance.vector_384 = None
        
        # Test with 768-dimensional embedder
        embedder_768 = TestEmbedder768()
        result_768 = store_embeddings(embedder_768, "Test text", "path.to.TestEmbedder768")
        self.assertEqual(result_768, mock_embedding_instance)
        mock_embedding_instance.save.assert_called()
        # Check that the vector was stored in the correct field
        self.assertIsNone(mock_embedding_instance.vector_384)
        self.assertIsNotNone(mock_embedding_instance.vector_768)
        self.assertIsNone(mock_embedding_instance.vector_1536)
        self.assertIsNone(mock_embedding_instance.vector_3072)
        
        # Reset mock
        mock_embedding_instance.reset_mock()
        mock_embedding_instance.vector_768 = None
        
        # Test with 1536-dimensional embedder
        embedder_1536 = TestEmbedder1536()
        result_1536 = store_embeddings(embedder_1536, "Test text", "path.to.TestEmbedder1536")
        self.assertEqual(result_1536, mock_embedding_instance)
        mock_embedding_instance.save.assert_called()
        # Check that the vector was stored in the correct field
        self.assertIsNone(mock_embedding_instance.vector_384)
        self.assertIsNone(mock_embedding_instance.vector_768)
        self.assertIsNotNone(mock_embedding_instance.vector_1536)
        self.assertIsNone(mock_embedding_instance.vector_3072)
        
        # Reset mock
        mock_embedding_instance.reset_mock()
        mock_embedding_instance.vector_1536 = None
        
        # Test with 3072-dimensional embedder
        embedder_3072 = TestEmbedder3072()
        result_3072 = store_embeddings(embedder_3072, "Test text", "path.to.TestEmbedder3072")
        self.assertEqual(result_3072, mock_embedding_instance)
        mock_embedding_instance.save.assert_called()
        # Check that the vector was stored in the correct field
        self.assertIsNone(mock_embedding_instance.vector_384)
        self.assertIsNone(mock_embedding_instance.vector_768)
        self.assertIsNone(mock_embedding_instance.vector_1536)
        self.assertIsNotNone(mock_embedding_instance.vector_3072)


if __name__ == "__main__":
    unittest.main() 