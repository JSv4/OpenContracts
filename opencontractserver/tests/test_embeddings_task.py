import unittest
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.tasks.embeddings_task import get_embedder_for_corpus

User = get_user_model()


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

    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.get_component_by_name")
    @patch("opencontractserver.tasks.embeddings_task.find_embedder_for_filetype")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
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

    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.find_embedder_for_filetype")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
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
        embedder_class, embedder_path = get_embedder_for_corpus(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.get_component_by_name")
    @patch("opencontractserver.tasks.embeddings_task.find_embedder_for_filetype")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
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
        embedder_class, embedder_path = get_embedder_for_corpus(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_get_component.assert_called_with("path.to.NonExistentEmbedder")
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.find_embedder_for_filetype")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
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
        embedder_class, embedder_path = get_embedder_for_corpus(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.find_embedder_for_filetype")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
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
        embedder_class, embedder_path = get_embedder_for_corpus(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_called_once()


class TestAnnotationSignals(unittest.TestCase):
    """
    Tests for the annotation signal handlers that process embeddings for structural annotations
    when they're created or when documents are added to corpuses.
    """

    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text.delay"
    )
    @patch("opencontractserver.annotations.signals.transaction")
    @patch("opencontractserver.annotations.signals.apps.get_model")
    def test_process_structural_annotation_for_corpuses(
        self, mock_get_model, mock_transaction, mock_calc_embedding_delay
    ):
        """
        Test that process_structural_annotation_for_corpuses correctly identifies corpuses
        and schedules embedding tasks for annotations.
        """
        from opencontractserver.annotations.signals import (
            process_structural_annotation_for_corpuses,
        )

        # Create mock classes with their objects managers
        mock_corpus_class = MagicMock()
        mock_corpus_objects = MagicMock()
        mock_corpus_class.objects = mock_corpus_objects

        mock_annotation_class = MagicMock()
        mock_annotation_objects = MagicMock()
        mock_annotation_class.objects = mock_annotation_objects

        # Set up mock for apps.get_model to return our mock classes
        def get_model_side_effect(app_label, model_name):
            if app_label == "corpuses" and model_name == "Corpus":
                return mock_corpus_class
            elif app_label == "annotations" and model_name == "Annotation":
                return mock_annotation_class
            return MagicMock()

        mock_get_model.side_effect = get_model_side_effect

        # Create mock annotation
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.document_id = 100
        mock_annot.document = MagicMock()
        mock_annot.structural = True

        # Set up corpus query results - simulate two corpuses
        mock_corpus_objects.filter.return_value.values_list.return_value = [
            (201, "path.to.Embedder1"),  # corpus_id, preferred_embedder
            (202, None),  # corpus with no preferred embedder
        ]

        # Mock the annotation filter to indicate no embeddings exist
        mock_annotation_objects.filter.return_value.exists.return_value = False

        # Mock settings.DEFAULT_EMBEDDER
        with patch("opencontractserver.annotations.signals.settings") as mock_settings:
            mock_settings.DEFAULT_EMBEDDER = "path.to.DefaultEmbedder"

            # Call the function
            process_structural_annotation_for_corpuses(mock_annot)

            # Verify corpus was queried correctly
            mock_corpus_objects.filter.assert_called_with(documents=mock_annot.document)

            # Verify annotation embedding check
            self.assertEqual(
                mock_annotation_objects.filter.call_count, 2
            )  # Once per corpus

            # Should have called transaction.on_commit twice (once per corpus)
            self.assertEqual(mock_transaction.on_commit.call_count, 2)

            # Simulate the transaction commit by invoking each lambda and verify that the
            # scheduled task uses the expected embedder path
            for idx, commit_call in enumerate(
                mock_transaction.on_commit.call_args_list
            ):
                lambda_func = commit_call[0][0]
                mock_calc_embedding_delay.reset_mock()
                lambda_func()
                expected_path = (
                    "path.to.Embedder1" if idx == 0 else "path.to.DefaultEmbedder"
                )
                mock_calc_embedding_delay.assert_called_once_with(
                    annotation_id=1, embedder_path=expected_path
                )

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_structural(
        self, mock_calc_embedding, mock_process_structural
    ):
        """
        Test that process_annot_on_create_atomic correctly processes structural annotations.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation that's structural
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.embedding = None
        mock_annotation.structural = True

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(annotation_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()

        # Verify process_structural_annotation_for_corpuses was called
        mock_process_structural.assert_called_with(mock_annotation)

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_non_structural(
        self, mock_calc_embedding, mock_process_structural
    ):
        """
        Test that process_annot_on_create_atomic correctly handles non-structural annotations.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation that's NOT structural
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.embedding = None
        mock_annotation.structural = False

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(annotation_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()

        # Verify process_structural_annotation_for_corpuses was NOT called
        mock_process_structural.assert_not_called()

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_existing_embedding(
        self, mock_calc_embedding, mock_process_structural
    ):
        """
        Test that process_annot_on_create_atomic skips annotations with existing embeddings.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation with an existing embedding
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.embedding = [0.1, 0.2, 0.3]  # Non-None embedding
        mock_annotation.structural = True

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was NOT scheduled
        mock_calc_embedding.si.assert_not_called()

        # Verify process_structural_annotation_for_corpuses was NOT called
        mock_process_structural.assert_not_called()

    @patch("opencontractserver.annotations.signals.calculate_embedding_for_note_text")
    def test_process_note_on_create(self, mock_calc_embedding):
        """
        Test that process_note_on_create_atomic correctly schedules note embedding tasks.
        """
        from opencontractserver.annotations.signals import process_note_on_create_atomic

        # Create mock note
        mock_note = MagicMock()
        mock_note.id = 1
        mock_note.embedding = None

        # Call the signal handler
        process_note_on_create_atomic(sender=None, instance=mock_note, created=True)

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(note_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()


class TestEmbeddingTask(unittest.TestCase):
    """
    Tests for the embedding task functions that calculate embeddings for annotations.
    """

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    @patch("opencontractserver.tasks.embeddings_task.get_component_by_name")
    def test_calculate_embedding_for_annotation_text_with_explicit_embedder(
        self, mock_get_component, mock_annotation
    ):
        """
        Test that calculate_embedding_for_annotation_text uses an explicitly provided embedder_path.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock annotation
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "This is test text"
        mock_annotation.objects.get.return_value = mock_annot

        # Mock the embedder
        mock_embedder = MagicMock()
        mock_embedder.embed_text.return_value = [0.1, 0.2, 0.3]
        mock_embedder_class = MagicMock(return_value=mock_embedder)
        mock_get_component.return_value = mock_embedder_class

        # Call the function with explicit embedder_path
        calculate_embedding_for_annotation_text(
            annotation_id=1, embedder_path="path.to.TestEmbedder"
        )

        # Verify the correct embedder was used
        mock_get_component.assert_called_with("path.to.TestEmbedder")
        mock_embedder.embed_text.assert_called_with("This is test text")

        # Verify embedding was stored
        mock_annot.add_embedding.assert_called_with(
            "path.to.TestEmbedder", [0.1, 0.2, 0.3]
        )

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    @patch("opencontractserver.tasks.embeddings_task.get_component_by_name")
    @patch("opencontractserver.tasks.embeddings_task.Corpus")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
    def test_calculate_embedding_for_annotation_text_fallback_to_annotation_corpus(
        self, mock_get_default, mock_corpus_model, mock_get_component, mock_annotation
    ):
        """
        Test that calculate_embedding_for_annotation_text falls back to the annotation's corpus embedder
        when no explicit embedder_path is provided.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock corpus with proper embed_text method
        mock_corpus_instance = MagicMock()
        mock_corpus_instance.embed_text.return_value = (
            "corpus.embedder.path",
            [0.4, 0.5, 0.6],
        )
        mock_corpus_instance.preferred_embedder = "corpus.embedder.path"
        mock_corpus_model.objects.get.return_value = mock_corpus_instance

        # Create mock annotation with corpus reference
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "This is test text"
        mock_annot.embedding = None
        # The key insight: in the code it doesn't use annot.corpus directly, but checks annot.corpus_id
        mock_annot.corpus = None  # This isn't used directly in the code
        mock_annot.corpus_id = 123  # This is what the code actually checks
        mock_annotation.objects.get.return_value = mock_annot

        # Call the function without embedder_path
        calculate_embedding_for_annotation_text(annotation_id=1)

        # Verify Corpus.objects.get was called with the correct corpus_id
        mock_corpus_model.objects.get.assert_called_with(id=123)

        # Verify corpus embedder was used
        mock_corpus_instance.embed_text.assert_called_with("This is test text")

        # Verify embedding was stored
        mock_annot.add_embedding.assert_called_with(
            "corpus.embedder.path", [0.4, 0.5, 0.6]
        )

        # Verify default embedder was not used
        mock_get_default.assert_not_called()

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    @patch("opencontractserver.tasks.embeddings_task.get_component_by_name")
    @patch("opencontractserver.tasks.embeddings_task.get_default_embedder")
    @patch("opencontractserver.tasks.embeddings_task.settings")
    def test_calculate_embedding_for_annotation_text_fallback_to_default(
        self, mock_settings, mock_get_default, mock_get_component, mock_annotation
    ):
        """
        Test that calculate_embedding_for_annotation_text falls back to the default embedder
        when no explicit embedder_path is provided and the annotation has no corpus.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock annotation with no corpus
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "This is test text"
        # Explicitly set corpus to None to ensure the test is clear about this case
        mock_annot.corpus = None
        mock_annot.corpus_id = None
        mock_annotation.objects.get.return_value = mock_annot

        # Mock default embedder settings and class
        mock_settings.DEFAULT_EMBEDDER = "default.embedder.path"

        # Set up the embedder class and instance
        mock_embedder = MagicMock()
        mock_embedder.embed_text.return_value = [0.7, 0.8, 0.9]
        mock_embedder_class = MagicMock(return_value=mock_embedder)
        mock_get_default.return_value = mock_embedder_class

        # Call the function without embedder_path
        calculate_embedding_for_annotation_text(annotation_id=1)

        # Verify default embedder was used
        mock_get_default.assert_called_once()
        mock_embedder.embed_text.assert_called_with("This is test text")

        # Verify embedding was stored
        mock_annot.add_embedding.assert_called_with(
            "default.embedder.path", [0.7, 0.8, 0.9]
        )


if __name__ == "__main__":
    unittest.main()
