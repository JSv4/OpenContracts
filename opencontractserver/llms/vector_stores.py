import logging
from typing import Any, Optional

from channels.db import database_sync_to_async
from django.db.models import Q, QuerySet
from llama_index.core.schema import BaseNode, TextNode
from llama_index.core.vector_stores.types import (
    BasePydanticVectorStore,
    MetadataFilter,
    MetadataFilters,
    VectorStoreQuery,
    VectorStoreQueryResult,
)

from opencontractserver.annotations.models import Annotation
from opencontractserver.shared.resolvers import resolve_oc_model_queryset
from opencontractserver.utils.embeddings import (
    generate_embeddings_from_text,
    get_embedder,
)

_logger = logging.getLogger(__name__)


class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    """Django Annotation Vector Store.

    This vector store uses Django's ORM to store and retrieve embeddings and text data
    from the Annotation model. It allows filtering by AnnotationLabel text, user, corpus, etc.

    Additionally, we now leverage `search_by_embedding` from `VectorSearchViaEmbeddingMixin`
    for vector-based retrieval (with a fallback to legacy-embedding fields, if needed).

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

    user_id: str | int | None = None
    corpus_id: str | int | None = None
    document_id: str | int | None = None
    must_have_text: str | None = None
    embedder_path: str | None = None

    def __init__(
        self,
        user_id: str | int | None = None,
        corpus_id: str | int | None = None,
        document_id: str | int | None = None,
        embedder_path: str | None = None,
        must_have_text: str | None = None,
        hybrid_search: bool = False,
        text_search_config: str = "english",
        embed_dim: int = 384,
        cache_ok: bool = False,
        perform_setup: bool = True,
        debug: bool = False,
        use_jsonb: bool = False,
    ):
        # First initialize the Pydantic model with all fields
        super().__init__(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            embedder_path=embedder_path,
            must_have_text=must_have_text,
            hybrid_search=hybrid_search,
            text_search_config=text_search_config,
            embed_dim=embed_dim,
            cache_ok=cache_ok,
            perform_setup=perform_setup,
            debug=debug,
            use_jsonb=use_jsonb,
        )

        # If a corpus is supplied, attempt to detect its configured embedder dimension
        embedder_class, embedder_path = get_embedder(
            corpus_id=corpus_id,
            embedder_path=embedder_path,
        )
        self.embedder_path = embedder_path
        _logger.info(f"On setup for vector store, embedder path: {self.embedder_path}")

        # Validate or fallback dimension
        if self.embed_dim not in [384, 768, 1536, 3072]:
            self.embed_dim = getattr(embedder_class, "vector_size", 768)

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
        embedder_path: str | None = None,
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
            embedder_path=embedder_path,
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

        if filters is None:
            return queryset

        for filter_ in filters.filters:
            # logger.info(f"_build_filter_query - filter: {filter_}")
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
            node = TextNode(
                doc_id=str(row.id),
                text=row.raw_text if isinstance(row.raw_text, str) else "",
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

            nodes.append(node)
            similarity_value = getattr(row, "similarity_score", 1.0)
            similarities.append(similarity_value)
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

    def _apply_metadata_filters(self, queryset, filters: MetadataFilters):
        """
        Applies the key-value filters from the VectorStore query to the base QuerySet.
        """
        if not filters or not filters.filters:
            return queryset

        for f in filters.filters:
            if isinstance(f, MetadataFilter):
                key, val = f.key, f.value
                if key == "annotation_label":
                    # Example: searching for a matching label text
                    queryset = queryset.filter(annotation_label__text__icontains=val)
                else:
                    # Otherwise fallback to a more generic approach if needed
                    queryset = queryset.filter(**{f"{key}__icontains": val})
        return queryset

    def query(self, query: VectorStoreQuery) -> VectorStoreQueryResult:
        """
        Executes a vector-based query or simple filter-based query on Annotations.
        1. If query.query_embedding is provided, use that directly.
        2. Else if query.query_str is provided, generate embeddings from text.
        3. Apply filters (corpus_id, document_id, user_id, must_have_text, etc.).
        4. If we have valid (embedder_path, vector), run search_by_embedding() for top_k results.
        5. Convert to LlamaIndex TextNodes and return.
        """
        # Build the base queryset
        _logger.info("Building base queryset for vector store query")
        queryset = Annotation.objects.all()
        _logger.info(f"Initial queryset: {queryset.query}")

        if self.corpus_id:
            _logger.info(f"Filtering by corpus_id: {self.corpus_id}")
            queryset = queryset.filter(corpus_id=self.corpus_id)
            _logger.info(f"After corpus filter: {queryset.query}")

        if self.document_id:
            _logger.info(f"Filtering by document_id: {self.document_id}")
            queryset = queryset.filter(document_id=self.document_id)
            _logger.info(f"After document filter: {queryset.query}")

        if self.user_id:
            _logger.info(f"Filtering by user_id: {self.user_id}")
            queryset = queryset.filter(creator_id=self.user_id)
            _logger.info(f"After user filter: {queryset.query}")

        if self.must_have_text:
            _logger.info(f"Filtering by text content: '{self.must_have_text}'")
            queryset = queryset.filter(raw_text__icontains=self.must_have_text)
            _logger.info(f"After text content filter: {queryset.query}")

        # Apply any metadata filters
        if query.filters:
            _logger.info(f"Applying metadata filters: {query.filters}")
            queryset = self._apply_metadata_filters(queryset, query.filters)
            _logger.info(f"After metadata filters: {queryset.query}")

        # Determine the embedding (either from query.query_embedding or generate from query.query_str)
        top_k = query.similarity_top_k if query.similarity_top_k else 100
        _logger.info(f"Using top_k value: {top_k}")
        vector = query.query_embedding

        if vector is None and query.query_str is not None:
            # Generate embeddings from the textual query
            # ignoring dimension mismatch or advanced error handling for brevity
            _logger.info(
                f"Generating embeddings from query string: '{query.query_str}'"
            )
            _logger.info(f"Filter on embedder path: {self.embedder_path}")
            embedder_path, vector = generate_embeddings_from_text(
                query.query_str,
                embedder_path=self.embedder_path,
            )
            _logger.info(f"Generated embeddings using embedder: {embedder_path}")
            if vector is not None:
                _logger.info(f"Vector dimension: {len(vector)}")
            else:
                _logger.warning("Failed to generate embeddings - vector is None")

        # If we do have a vector, run search_by_embedding...
        if vector is not None and len(vector) in [384, 768, 1536, 3072]:
            _logger.info(f"Using vector search with dimension: {len(vector)}")

            # Because `search_by_embedding` requires embedder_path & query_vector
            _logger.info(
                f"Performing vector search with embedder: {self.embedder_path}"
            )
            queryset = queryset.search_by_embedding(
                query_vector=vector, embedder_path=self.embedder_path, top_k=top_k
            )
            _logger.info(f"After vector search: {queryset}")
        else:
            # Either no vector or invalid dimension => do nothing special
            if vector is None:
                _logger.info("No vector available for search, using standard filtering")
            else:
                _logger.warning(
                    f"Invalid vector dimension: {len(vector)}, using standard filtering"
                )

            if query.similarity_top_k is not None:
                _logger.info(f"Limiting results to top {top_k}")
                queryset = queryset[:top_k]
                _logger.info(f"After limiting results: {queryset}")

        # Fetch the annotations
        _logger.info("Fetching annotations from database")

        # Fails here
        annotations = list(queryset)
        _logger.info(f"Retrieved {len(annotations)} annotations")
        if annotations:
            _logger.info(f"First annotation ID: {annotations[0].id}")
            _logger.info(f"Sample annotation fields: {vars(annotations[0])}")
        else:
            _logger.warning("No annotations found for the query")

        # Convert them to TextNodes
        _logger.info("Converting annotations to TextNodes")

        # Log the final result details

        return self._db_rows_to_query_result(annotations)

        # if nodes:
        #     _logger.info(f"First node text sample: {nodes[0].text[:100]}...")

        # return VectorStoreQueryResult(nodes=nodes, similarities=similarities, ids=ids)

    async def aquery(
        self, query: VectorStoreQuery, **kwargs: Any
    ) -> VectorStoreQueryResult:
        """Asynchronous convenience wrapper that calls query()."""
        return await database_sync_to_async(self.query)(query, **kwargs)
