import random
from typing import Optional
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings
from llama_index.core.vector_stores import (
    MetadataFilter,
    MetadataFilters,
    VectorStoreQuery,
)

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

User = get_user_model()


def random_vector(dimension: int = 384, seed: Optional[int] = None) -> list[float]:
    """
    Generates a random vector of the specified dimension.
    Optionally accepts a seed to ensure reproducibility.
    """
    rng = random.Random(seed)
    return [rng.random() for _ in range(dimension)]


def constant_vector(dimension: int = 384, value: float = 0.5) -> list[float]:
    """
    Generates a constant vector of a given dimension (default 384).
    Useful to simulate a dummy query vector of the correct dimension.
    """
    return [value] * dimension


class TestDjangoAnnotationVectorStore(TestCase):
    """
    A test suite for the DjangoAnnotationVectorStore class,
    particularly focusing on the new generate_embeddings_from_text,
    search_by_embedding patterns, and ensuring that we handle:
      - user ID filtering
      - corpus ID filtering
      - document ID filtering
      - partial text matching
      - annotation label metadata filters
      - direct query embedding usage
      - generated query embedding usage (via query_str)
    """

    @classmethod
    def setUpTestData(cls) -> None:
        """
        Create a user, a corpus, documents, and annotations with embeddings
        to support the tests. We'll use our updated code that adds embeddings
        for these objects, thus ensuring we can retrieve them by vector queries.
        """

        with transaction.atomic():
            cls.user = User.objects.create_user(
                username="testuser",
                password="testpass",
                email="testuser@example.com",
            )

            cls.corpus = Corpus.objects.create(
                title="Test Corpus for DAVA",
                creator=cls.user,
                is_public=True,
            )

            cls.doc1 = Document.objects.create(
                title="Document One",
                corpus=cls.corpus,
                creator=cls.user,
                is_public=True,
            )

            cls.doc2 = Document.objects.create(
                title="Document Two",
                corpus=cls.corpus,
                creator=cls.user,
                is_public=True,
            )

            # Labels
            cls.label_important = AnnotationLabel.objects.create(
                text="Important Label",
                creator=cls.user,
            )
            cls.label_minor = AnnotationLabel.objects.create(
                text="Minor Label",
                creator=cls.user,
            )

            # Annotations
            cls.anno1 = Annotation.objects.create(
                document=cls.doc1,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="This is the first annotation text for doc1",
                annotation_label=cls.label_important,
                is_public=True,
            )
            cls.anno2 = Annotation.objects.create(
                document=cls.doc1,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="Another annotation text, minor label, on doc1",
                annotation_label=cls.label_minor,
                is_public=True,
            )
            cls.anno3 = Annotation.objects.create(
                document=cls.doc2,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="Annotation text for doc2, important label",
                annotation_label=cls.label_important,
                is_public=True,
            )
            cls.anno4 = Annotation.objects.create(
                document=cls.doc2,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="Just some random text in doc2 with no label set",
                annotation_label=None,
                is_public=True,
            )

        # Add embeddings (384 dimension) to anno1, anno2, anno3; skip anno4 to confirm no-embed.
        dim = 384
        cls.anno1.add_embedding(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
            constant_vector(dim, 0.1),
        )
        cls.anno2.add_embedding(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
            constant_vector(dim, 0.2),
        )
        cls.anno3.add_embedding(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
            constant_vector(dim, 0.3),
        )
        # no embedding for anno4

    def setUp(self) -> None:
        """
        Instantiate a DjangoAnnotationVectorStore each test with default filters.
        """
        self.vector_store = DjangoAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            document_id=None,
            must_have_text=None,
        )

    def run_sync_query(self, query: VectorStoreQuery):
        """
        Helper to call the async .query method from a sync test environment.
        """
        return self.vector_store.query(query)

    def test_query_with_no_vector(self) -> None:
        """
        If we do a query without specifying either query_embedding or query_str,
        just retrieve all matching annotations for the corpus (and user) with no doc_id.
        """
        query = VectorStoreQuery(
            query_embedding=None, query_str=None, similarity_top_k=None
        )
        result = self.run_sync_query(query)
        self.assertEqual(
            len(result.nodes),
            4,
            "Should return all four annotations (no embedding filter).",
        )

    def test_query_with_document_filter(self) -> None:
        """
        Verifies specifying document_id in the vector store's init filters
        yields only that doc's annotations.
        """
        store_doc1 = DjangoAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            document_id=self.doc1.id,
        )
        query = VectorStoreQuery(
            query_embedding=None, query_str=None, similarity_top_k=None
        )
        result = store_doc1.query(query)
        self.assertEqual(
            len(result.nodes), 2, "Should have exactly 2 annotations from doc1."
        )
        texts = [n.text for n in result.nodes]
        self.assertTrue(any("first annotation text" in t for t in texts))
        self.assertTrue(any("Another annotation" in t for t in texts))

    def test_query_with_text_filter(self) -> None:
        """
        Using must_have_text substring search in the store's init.
        """
        store_text_filter = DjangoAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            must_have_text="Another",
        )
        query = VectorStoreQuery(
            query_embedding=None, query_str=None, similarity_top_k=None
        )
        result = store_text_filter.query(query)
        self.assertEqual(
            len(result.nodes), 1, "Only anno2 matches the substring 'Another'."
        )
        self.assertIn(
            "Another annotation text, minor label, on doc1", result.nodes[0].text
        )

    @override_settings(
        DEFAULT_EMBEDDER="opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder"  # noqa: E501
    )
    def test_query_by_vector_similarity_explicit_embedding(self) -> None:
        """
        Provide an explicit query embedding. Expect to see only annotations with embeddings
        (anno1, 2, 3) in ascending distance order, limited by top_k.
        """
        query_vec = constant_vector(384, value=0.25)
        query = VectorStoreQuery(query_embedding=query_vec, similarity_top_k=3)
        result = self.run_sync_query(query)
        # Because the dimension is 384, we only expect anno1,2,3 to appear. Anno4 has no embedding.
        returned_ids = {n.metadata["annotation_id"] for n in result.nodes}
        self.assertNotIn(
            self.anno4.id,
            returned_ids,
            "anno4 has no embedding, shouldn't appear.",
        )
        self.assertIn(self.anno1.id, returned_ids)
        self.assertIn(self.anno2.id, returned_ids)
        self.assertIn(self.anno3.id, returned_ids)

    @patch("opencontractserver.utils.embeddings.generate_embeddings_from_text")
    def test_query_by_vector_similarity_generated_from_query_str(self, mock_gen_embeds):
        """
        Provide a textual query_str. We want to generate a known embedding
        so the search_by_embedding call has consistent results for testing.
        """
        # 1) Mock the generate_embeddings_from_text to return a vector of dimension 384
        mock_gen_embeds.return_value = (
            "mocked-embedder",
            [0.25] * 384,  # or any other test vector
        )

        # 2) Instantiate your vector store
        store = DjangoAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            document_id=None,
            must_have_text=None,
        )

        # 3) Run the query with a query_str
        query = VectorStoreQuery(
            query_embedding=None, query_str="some text", similarity_top_k=3
        )

        # Ensure anno4 doesn't have an embedding before running the query
        # TODO - the embedding shouldn't be here... but having trouble stopping signal from firing.
        self.anno4.embedding_set.all().delete()

        result = store.query(query)

        # 4) Assert you get the annotations you expect
        returned_ids = {n.metadata["annotation_id"] for n in result.nodes}

        # Verify the expected annotations are returned
        self.assertIn(self.anno1.id, returned_ids)
        self.assertIn(self.anno2.id, returned_ids)
        self.assertIn(self.anno3.id, returned_ids)
        self.assertNotIn(
            str(self.anno4.id), returned_ids, "Should exclude anno4 with no embedding."
        )

    def test_query_with_label_metadata_filter(self) -> None:
        """
        Ensures we can filter by annotation_label text via the VectorStoreQuery filters.
        """
        filters = MetadataFilters(
            filters=[MetadataFilter(key="annotation_label", value="Important Label")]
        )
        query = VectorStoreQuery(
            query_embedding=None, query_str=None, filters=filters, similarity_top_k=10
        )

        result = self.run_sync_query(query)
        returned_texts = [n.text for n in result.nodes]
        # anno1, anno3 both have "Important Label"
        self.assertEqual(
            len(returned_texts),
            2,
            "We expect exactly 2 annotations with label=Important Label.",
        )
        self.assertTrue(any("first annotation text" in txt for txt in returned_texts))
        self.assertTrue(any("doc2, important label" in txt for txt in returned_texts))

    @patch("opencontractserver.utils.embeddings.generate_embeddings_from_text")
    def test_query_str_fallback_when_no_embedding(self, mock_gen_embeds):
        """
        If a user calls a query with query_str but the dimension is unsupported or generate_embeddings
        fails (None, None), we should just return results with no vector-based ordering.
        """

        # Return (None, None) from generate_embeddings_from_text so the vector store
        # can't do a similarity search and must fallback.
        mock_gen_embeds.return_value = (None, None)

        query = VectorStoreQuery(
            query_embedding=None, query_str="some text", similarity_top_k=3
        )
        result = self.run_sync_query(query)
        self.assertEqual(
            len(result.nodes),
            3,
            "Should return all annotations with non-null embedding if embedding is None.",
        )

    def test_query_with_top_k_exceeded(self) -> None:
        """
        If we specify a top_k smaller than the total matched set, ensure we only get top_k back.
        We'll do so with an explicit embedding search. We expect 3 matching +1 no embed => only 3 returned.
        """
        query_vec = constant_vector(384, value=0.25)
        query = VectorStoreQuery(query_embedding=query_vec, similarity_top_k=2)
        result = self.run_sync_query(query)
        self.assertLessEqual(
            len(result.nodes),
            2,
            "We should only retrieve top_k=2 with similarity search.",
        )

    def test_batch_add_embeddings_and_corpus_exclusion(self) -> None:
        """
        1) Demonstrates adding embeddings in batch via add_embeddings().
        2) Ensures that annotations belonging to a different corpus
           are excluded from queries restricted to self.corpus.
        """
        # Create a separate corpus for testing exclusion
        other_corpus = Corpus.objects.create(
            title="Unrelated Corpus",
            creator=self.user,
            is_public=True,
        )

        # Create a new annotation in cls.corpus
        new_annotation_in_corpus = Annotation.objects.create(
            document=self.doc1,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Batch-embedded annotation in the existing test corpus",
            annotation_label=self.label_important,
            is_public=True,
        )

        # Create an annotation in the other_corpus
        annotation_other_corpus = Annotation.objects.create(
            document=self.doc1,
            corpus=other_corpus,
            creator=self.user,
            raw_text="Annotation in a different corpus",
            annotation_label=self.label_important,
            is_public=True,
        )

        # Add multiple embeddings in a single batch for each annotation
        vectors_for_batch = [
            constant_vector(384, 0.45),
            constant_vector(384, 0.55),
        ]
        new_annotation_in_corpus.add_embeddings(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
            vectors_for_batch,
        )
        annotation_other_corpus.add_embeddings(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
            vectors_for_batch,
        )

        # Instantiate a vector store restricted to self.corpus
        store = DjangoAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            document_id=None,
            must_have_text=None,
        )

        # Submit a vector-based query
        query_vec = constant_vector(384, value=0.50)
        query = VectorStoreQuery(query_embedding=query_vec, similarity_top_k=10)
        result = store.query(query)

        returned_ids = {node.metadata["annotation_id"] for node in result.nodes}

        # Annotation in self.corpus should appear
        self.assertIn(
            new_annotation_in_corpus.id,
            returned_ids,
            "Expected in-corpus annotation to be retrieved.",
        )

        # Annotation in other_corpus should not appear
        self.assertNotIn(
            annotation_other_corpus.id,
            returned_ids,
            "Annotation from a different corpus must be excluded.",
        )
