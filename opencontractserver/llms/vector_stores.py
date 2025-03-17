import logging
from typing import Any, Optional

from channels.db import database_sync_to_async
from django.db.models import Q, QuerySet
from llama_index.core.schema import BaseNode, TextNode
from llama_index.core.vector_stores.types import (
    BasePydanticVectorStore,
    MetadataFilters,
    VectorStoreQuery,
    VectorStoreQueryResult,
)
from pgvector.django import CosineDistance

from opencontractserver.annotations.models import Annotation
from opencontractserver.shared.resolvers import resolve_oc_model_queryset
from opencontractserver.tasks.embeddings_task import get_embedder_for_corpus

_logger = logging.getLogger(__name__)


class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    """Django Annotation Vector Store.

    This vector store uses Django's ORM to store and retrieve embeddings and text data
    from the Annotation model. It allows filtering by AnnotationLabel text.

    Args:
        user_id (str|int|None): Filter by user ID
        corpus_id (str|int|None): Filter by corpus ID
        document_id (str|int|None): Filter by document ID
        must_have_text (str|None): Filter by text content
        embed_dim (int): Embedding dimension to use (384, 768, 1536, or 3072)
    """

    stores_text: bool = True
    flat_metadata: bool = False
    embed_dim: int = 384

    user_id: str | int | None
    corpus_id: str | int | None
    document_id: str | int | None
    must_have_text: str | None

    def __init__(
        self,
        user_id: str | int | None = None,
        corpus_id: str | int | None = None,
        document_id: str | int | None = None,
        must_have_text: str | None = None,
        hybrid_search: bool = False,
        text_search_config: str = "english",
        embed_dim: int = 384,
        cache_ok: bool = False,
        perform_setup: bool = True,
        debug: bool = False,
        use_jsonb: bool = False,
    ):
        # Get the preferred embedder and its dimension from the corpus if available
        if corpus_id:
            try:
                # Get the embedder for the corpus
                embedder_class, _ = get_embedder_for_corpus(corpus_id)
                if embedder_class and hasattr(embedder_class, "vector_size"):
                    # Get the dimension from the embedder class
                    embed_dim = embedder_class.vector_size
            except Exception as e:
                _logger.error(f"Error getting embedder for corpus {corpus_id}: {e}")

        # Validate the embedding dimension
        if embed_dim not in [384, 768, 1536, 3072]:
            from django.conf import settings

            embed_dim = getattr(settings, "DEFAULT_EMBEDDING_DIMENSION", 768)

        super().__init__(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            must_have_text=must_have_text,
            hybrid_search=hybrid_search,
            text_search_config=text_search_config,
            embed_dim=embed_dim,
            cache_ok=cache_ok,
            perform_setup=perform_setup,
            debug=debug,
            use_jsonb=use_jsonb,
        )

        # Store the embedding dimension for use in query methods
        self.embed_dim = embed_dim

    async def close(self) -> None:
        return

    @classmethod
    def class_name(cls) -> str:
        return "DjangoAnnotationVectorStore"

    @classmethod
    def from_params(
        cls,
        user_id: str | int | None = None,
        corpus_id: str | int | None = None,
        document_id: str | int | None = None,
        must_have_text: str | None = None,
        hybrid_search: bool = False,
        text_search_config: str = "english",
        embed_dim: int = 1536,
        cache_ok: bool = False,
        perform_setup: bool = True,
        debug: bool = False,
        use_jsonb: bool = False,
    ) -> "DjangoAnnotationVectorStore":
        return cls(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            must_have_text=must_have_text,
            hybrid_search=hybrid_search,
            text_search_config=text_search_config,
            embed_dim=embed_dim,
            cache_ok=cache_ok,
            perform_setup=perform_setup,
            debug=debug,
            use_jsonb=use_jsonb,
        )

    def _get_annotation_queryset(self) -> QuerySet:
        """Get the base Annotation queryset."""
        # Need to do this this way because some annotations don't travel with the corpus but the document itself - e.g.
        # layout and structural annotations from the nlm parser.

        structural_queryset = Annotation.objects.filter(
            Q(is_public=True) | Q(structural=True)
        ).distinct()
        other_queryset = resolve_oc_model_queryset(
            Annotation, user=self.user_id
        ).distinct()
        queryset = structural_queryset | other_queryset

        if self.corpus_id is not None:
            queryset = queryset.filter(
                Q(corpus_id=self.corpus_id) | Q(document__corpus=self.corpus_id)
            )
        if self.document_id is not None:
            queryset = queryset.filter(document=self.document_id)
        if self.must_have_text is not None:
            queryset = queryset.filter(raw_text__icontains=self.must_have_text)
        return queryset.distinct()

    def _build_filter_query(self, filters: Optional[MetadataFilters]) -> QuerySet:
        """Build the filter query based on the provided metadata filters."""
        queryset = self._get_annotation_queryset()

        # print(f"_build_filter_query: {queryset.count()}")

        if filters is None:
            return queryset

        for filter_ in filters.filters:
            # print(f"_build_filter_query - filter: {filter_}")
            if filter_.key == "label":
                queryset = queryset.filter(annotation_label__text__iexact=filter_.value)
            else:
                raise ValueError(f"Unsupported filter key: {filter_.key}")

        return queryset

    def _db_rows_to_query_result(
        self, rows: list[Annotation]
    ) -> VectorStoreQueryResult:
        """Convert database rows to a VectorStoreQueryResult."""
        nodes = []
        similarities = []
        ids = []

        for row in rows:
            # print(f"Embedding type: {type(row.embedding)} {row.embedding}")
            # print(f"Row id: {row.id}")
            node = TextNode(
                doc_id=str(row.id),
                text=row.raw_text,
                embedding=row.embedding.tolist()
                if getattr(row, "embedding", None) is not None
                else [],
                extra_info={
                    "page": row.page,
                    "json": row.json,
                    "bounding_box": row.bounding_box,
                    "annotation_id": row.id,
                    "label": row.annotation_label.text
                    if row.annotation_label
                    else None,
                    "label_id": row.annotation_label.id
                    if row.annotation_label
                    else None,
                },
            )
            # print(f"Created node: {node}")
            # print(f"Node ref doc: {node.ref_doc_id}")
            # print(f"Node dir: {dir(node)}")
            nodes.append(node)
            similarities.append(row.similarity)
            ids.append(str(row.id))

        return VectorStoreQueryResult(nodes=nodes, similarities=similarities, ids=ids)

    @property
    def client(self) -> None:
        """Return None since the Django ORM is used instead of a separate client."""
        return None

    def add(self, nodes: list[BaseNode], **add_kwargs: Any) -> list[str]:
        """Don't actually want to add entries via LlamaIndex"""
        return []

    async def async_add(self, nodes: list[BaseNode], **kwargs: Any) -> list[str]:
        """Add nodes asynchronously to the vector store."""
        return self.add(nodes, **kwargs)

    def delete(self, doc_id: str, **delete_kwargs: Any):
        """Don't want this to occur through LlamaIndex."""
        pass

    def _get_embedding_field(self) -> str:
        """
        Get the appropriate embedding field name based on the dimension.

        Returns:
            str: The field name to use for vector similarity search
        """
        if self.embed_dim == 384:
            return (
                "embeddings__vector_384",
                "embedding",
            )  # Also return legacy field for 384
        elif self.embed_dim == 768:
            return "embeddings__vector_768", None
        elif self.embed_dim == 1536:
            return "embeddings__vector_1536", None
        elif self.embed_dim == 3072:
            return "embeddings__vector_3072", None
        else:
            # Default to 384 for backward compatibility
            return "embeddings__vector_384", "embedding"

    async def query(self, query: VectorStoreQuery) -> VectorStoreQueryResult:
        """Query the vector store."""
        from opencontractserver.annotations.models import Annotation

        # Get the embedding field name based on the dimension
        embedding_field, legacy_field = self._get_embedding_field()

        # Build the query
        queryset = Annotation.objects.all()

        # Apply filters
        if self.corpus_id:
            queryset = queryset.filter(corpus_id=self.corpus_id)
        if self.document_id:
            queryset = queryset.filter(document_id=self.document_id)
        if self.user_id:
            queryset = queryset.filter(creator_id=self.user_id)
        if self.must_have_text:
            queryset = queryset.filter(raw_text__icontains=self.must_have_text)

        # Apply metadata filters if provided
        if query.filters is not None:
            queryset = self._apply_metadata_filters(queryset, query.filters)

        # Apply vector similarity search
        if query.query_embedding is not None:
            # Try the new embedding model first
            new_embedding_queryset = queryset.filter(
                **{f"{embedding_field}__isnull": False}
            )

            if await database_sync_to_async(new_embedding_queryset.exists)():
                # Use the new embedding model
                queryset = new_embedding_queryset.order_by(
                    CosineDistance(embedding_field, query.query_embedding)
                )
            elif legacy_field and self.embed_dim == 384:
                # Fall back to legacy embedding field for 384-dim only
                legacy_queryset = queryset.filter(**{f"{legacy_field}__isnull": False})
                if await database_sync_to_async(legacy_queryset.exists)():
                    queryset = legacy_queryset.order_by(
                        CosineDistance(legacy_field, query.query_embedding)
                    )

        # Apply limit
        if query.similarity_top_k is not None:
            queryset = queryset[: query.similarity_top_k]

        # Execute query and convert to nodes
        annotations = await database_sync_to_async(list)(queryset)
        nodes = []

        for annotation in annotations:
            node = TextNode(
                text=annotation.raw_text or "",
                id_=str(annotation.id),
                metadata={
                    "annotation_id": annotation.id,
                    "document_id": annotation.document_id,
                    "corpus_id": annotation.corpus_id,
                    "page": annotation.page,
                    "annotation_type": annotation.annotation_type,
                    "creator_id": annotation.creator_id,
                    "created": annotation.created.isoformat()
                    if annotation.created
                    else None,
                },
            )
            nodes.append(node)

        return VectorStoreQueryResult(nodes=nodes)

    async def aquery(
        self, query: VectorStoreQuery, **kwargs: Any
    ) -> VectorStoreQueryResult:
        """Query the vector store asynchronously."""
        return await database_sync_to_async(self.query)(query, **kwargs)
