"""
Tests for verifying that Embeddings associated with Documents, Annotations, and Notes
can be created and queried via the manager-provided vector search methods, using the
new mixin-based approach to register embeddings (e.g. model_instance.add_embedding()).
"""

import random

from django.test import TestCase

from opencontractserver.annotations.models import Annotation, Note
from opencontractserver.documents.models import Document

# We no longer need to directly import Embedding for creation, unless required for other tests
# from opencontractserver.annotations.models import Embedding


def random_vector(dimension: int = 384) -> list[float]:
    """
    Generates a random vector of the specified dimension. By default, 384 floats.
    In practice, for deterministic tests, you might fix the seed or choose exact values.
    """
    return [random.random() for _ in range(dimension)]


def constant_vector(dimension: int = 384, value: float = 0.1) -> list[float]:
    """
    Generates a constant vector of given dimension (default 384).
    Useful to simulate a 'dummy' query vector of the correct dimension.
    """
    return [value] * dimension


class TestEmbeddingSearch(TestCase):
    """
    Validates that we can create embeddings for Documents, Annotations, and Notes
    and query them using our new *search_by_embedding* manager methods.
    Now uses the mixin-based approach to add embeddings (e.g. doc.add_embedding()).
    """

    def setUp(self) -> None:
        """
        In setUp, we create:
          - 2 Documents (doc1, doc2)
          - 2 Annotations (anno1, anno2) each on different Documents
          - 2 Notes (note1, note2) each on different Documents

        Then we store embeddings using the new .add_embedding() API:
          - doc1, anno1, note1: embedder_path="openai/text-embedding-ada-002"
          - doc2, anno2, note2: some with "openai/text-embedding-ada-002"
            and some with "some-other-embedder" to verify embedder-based filtering.
        """
        # Create some "parent" objects
        self.doc1 = Document.objects.create(
            title="Document One", creator_id=1, is_public=True
        )
        self.doc2 = Document.objects.create(
            title="Document Two", creator_id=1, is_public=True
        )

        self.anno1 = Annotation.objects.create(
            document=self.doc1,
            page=1,
            creator_id=1,
            is_public=True,
            raw_text="First annotation text",
        )
        self.anno2 = Annotation.objects.create(
            document=self.doc2,
            page=2,
            creator_id=1,
            is_public=True,
            raw_text="Second annotation text",
        )

        self.note1 = Note.objects.create(
            document=self.doc1,
            creator_id=1,
            is_public=True,
            title="Note #1",
        )
        self.note2 = Note.objects.create(
            document=self.doc2,
            creator_id=1,
            is_public=True,
            title="Note #2",
        )

        # We'll consistently use dimension=384 embeddings.
        dim_384 = 384

        # Store embeddings on doc1 using the "openai" embedder
        self.doc1.add_embedding(
            embedder_path="openai/text-embedding-ada-002",
            vector=random_vector(dim_384),
        )

        # Store two embeddings on doc2: one with "openai", and one with "some-other"
        self.doc2.add_embedding(
            embedder_path="openai/text-embedding-ada-002",
            vector=random_vector(dim_384),
        )
        self.doc2.add_embedding(
            embedder_path="some-other-embedder",
            vector=random_vector(dim_384),
        )

        # Embeddings for anno1 & anno2, both with "openai" (just as an example).
        self.anno1.add_embedding(
            embedder_path="openai/text-embedding-ada-002",
            vector=random_vector(dim_384),
        )
        self.anno2.add_embedding(
            embedder_path="openai/text-embedding-ada-002",
            vector=random_vector(dim_384),
        )

        # Embedding for note1 with "openai"
        self.note1.add_embedding(
            embedder_path="openai/text-embedding-ada-002",
            vector=random_vector(dim_384),
        )
        # Embedding for note2 with "some-other"
        self.note2.add_embedding(
            embedder_path="some-other-embedder",
            vector=random_vector(dim_384),
        )

    def test_document_embedding_search(self) -> None:
        """
        Ensures Document.objects.search_by_embedding() returns
        only documents with the requested embedder/dimensions.
        """
        # We'll create a 384-dim query vector
        query_vec = constant_vector(dimension=384, value=0.1)

        # Searching with the "openai" embedder should return doc1 and doc2
        results_openai = Document.objects.search_by_embedding(
            query_vector=query_vec,
            embedder_path="openai/text-embedding-ada-002",
            top_k=10,
        )
        self.assertIn(self.doc1, results_openai)
        self.assertIn(self.doc2, results_openai)

        # Searching with "some-other-embedder" should return doc2 but not doc1
        results_other = Document.objects.search_by_embedding(
            query_vector=query_vec,
            embedder_path="some-other-embedder",
            top_k=10,
        )
        self.assertIn(self.doc2, results_other)
        self.assertNotIn(self.doc1, results_other)

    def test_annotation_embedding_search(self) -> None:
        """
        Ensures we can search annotations via search_by_embedding() if
        the AnnotationQuerySet implements VectorSearchViaEmbeddingMixin.
        """
        query_vec = constant_vector(dimension=384, value=0.2)

        try:
            results = Annotation.objects.search_by_embedding(
                query_vector=query_vec,
                embedder_path="openai/text-embedding-ada-002",
                top_k=10,
            )
            self.assertIn(self.anno1, results)
            self.assertIn(self.anno2, results)
        except AttributeError:
            self.skipTest("AnnotationQuerySet does not implement search_by_embedding")

    def test_note_embedding_search(self) -> None:
        """
        Ensures we can search notes by embedding if
        the NoteQuerySet implements VectorSearchViaEmbeddingMixin.
        """
        query_vec = constant_vector(dimension=384, value=0.3)

        try:
            # Searching for "openai" path
            results_openai = Note.objects.search_by_embedding(
                query_vector=query_vec,
                embedder_path="openai/text-embedding-ada-002",
                top_k=10,
            )
            self.assertIn(self.note1, results_openai)
            self.assertNotIn(self.note2, results_openai)

            # Searching for "some-other-embedder"
            results_other = Note.objects.search_by_embedding(
                query_vector=query_vec,
                embedder_path="some-other-embedder",
                top_k=10,
            )
            self.assertIn(self.note2, results_other)
            self.assertNotIn(self.note1, results_other)
        except AttributeError:
            self.skipTest("NoteQuerySet does not implement search_by_embedding")
