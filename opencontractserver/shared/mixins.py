from typing import List

from django.db.models import QuerySet
from pgvector.django import CosineDistance


class VectorSearchViaEmbeddingMixin:
    """
    A mixin to enable vector similarity searches on a model that does NOT
    itself hold the embedding columns, but instead has a *reverse* relationship
    to an Embedding model. 
    Specifically, we assume the model's related name is "embeddings", pointing
    from Embedding -> e.g. document/annotation/note.

    In usage:
      class DocumentQuerySet(QuerySet, VectorSearchViaEmbeddingMixin):
          EMBEDDING_RELATED_NAME = "embeddings"

      Then you can call:
          Document.objects.search_by_embedding([...], "some-embedder", top_k=10)
    """

    # If your reverse relationship is not named "embeddings", override below in your subclass
    EMBEDDING_RELATED_NAME: str = "embedding_set"

    def _dimension_to_field(self, dimension: int) -> str:
        """
        Given the dimension of the query vector, return the appropriate field
        on the Embedding model (vector_384, vector_768, etc.).
        """
        if dimension == 384:
            return f"{self.EMBEDDING_RELATED_NAME}__vector_384"
        elif dimension == 768:
            return f"{self.EMBEDDING_RELATED_NAME}__vector_768"
        elif dimension == 1536:
            return f"{self.EMBEDDING_RELATED_NAME}__vector_1536"
        elif dimension == 3072:
            return f"{self.EMBEDDING_RELATED_NAME}__vector_3072"
        else:
            raise ValueError(f"Unsupported embedding dimension: {dimension}")

    def search_by_embedding(
        self,
        query_vector: List[float],
        embedder_path: str,
        top_k: int = 10,
    ) -> QuerySet:
        """
        Vector search for records of this model by embeddings stored in
        a reverse relation to Embedding (embedding->document, for instance).

        - dimension is inferred from len(query_vector)
        - filters on embedder_path
        - excludes cases where the chosen vector field is null
        - adds an annotation 'similarity_score' via CosineDistance
        - sorts ascending by that distance
        - slices top_k

        Returns a QuerySet of your model (Document, Annotation, Note), 
        annotated with 'similarity_score'.
        """
        dimension = len(query_vector)
        vector_field = self._dimension_to_field(dimension)

        # Must join to Embedding objects that have embedder_path == embedder_path
        # and a non-null vector_xxx field
        base_qs = self.filter(
            **{
                f"{self.EMBEDDING_RELATED_NAME}__embedder_path": embedder_path,
                f"{vector_field}__isnull": False,
            }
        )

        # Use annotate(...) plus the CosineDistance from pgvector
        base_qs = base_qs.annotate(
            similarity_score=CosineDistance(vector_field, query_vector)
        )

        # Order ascending by distance, then limit to top_k
        return base_qs.order_by("similarity_score")[:top_k]


class HasEmbeddingMixin:
    """
    Mixin that provides helper methods for creating/updating embeddings on any model
    that references Embedding via (document_id, annotation_id, or note_id).

    The only requirement is that the model must implement:
        def get_embedding_reference_kwargs(self) -> dict

    Example usage for a subclass:
        class Document(BaseOCModel, HasEmbeddingMixin):
            def get_embedding_reference_kwargs(self) -> dict:
                return {"document_id": self.pk}
    """

    def get_embedding_reference_kwargs(self) -> dict:
        """
        Must be overridden by the subclass.
        Return a dictionary like {"document_id": self.pk} or {"annotation_id": self.pk}, etc.
        """
        raise NotImplementedError("Subclass must implement get_embedding_reference_kwargs()")

    def add_embedding(self, embedder_path: str, vector: List[float]):
        """
        Creates or updates an Embedding for this object (Document, Annotation, Note, etc.)
        with the given embedder and vector.

        Args:
            embedder_path (str): Identifier of the embedding model ("openai/ada" etc.)
            vector (List[float]): Embedding values as a list of floats, e.g., dimension=384

        Returns:
            Embedding: The created or updated Embedding instance
        """
        # Late import to avoid circular import at the module level
        from opencontractserver.annotations.models import Embedding

        dimension = len(vector)
        kwargs = self.get_embedding_reference_kwargs()  # e.g. {"document_id": self.pk} for Documents
        return Embedding.objects.store_embedding(
            creator=self.creator,
            dimension=dimension,
            vector=vector,
            embedder_path=embedder_path,
            **kwargs
        )

    def add_embeddings(self, embedder_path: str, vectors: List[List[float]]):
        """
        Creates or updates multiple Embedding records for this object, given a collection of
        vectors (all presumably from the same embedder).

        Args:
            embedder_path (str): Name/identifier for the embedding model used.
            vectors (List[List[float]]): A list of lists of floats, each representing one embedding.

        Returns:
            List[Embedding]: A list of created/updated Embedding objects.
        """
        from opencontractserver.annotations.models import Embedding

        embedding_objects = []
        for vec in vectors:
            dimension = len(vec)
            kwargs = self.get_embedding_reference_kwargs()
            emb = Embedding.objects.store_embedding(
                creator=self.creator,
                dimension=dimension,
                vector=vec,
                embedder_path=embedder_path,
                **kwargs
            )
            embedding_objects.append(emb)
        return embedding_objects
