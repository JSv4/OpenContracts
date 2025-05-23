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
from opencontractserver.llms.core_vector_stores import (
    CoreAnnotationVectorStore,
    VectorSearchQuery,
)

_logger = logging.getLogger(__name__)


class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    """LlamaIndex adapter for Django Annotation Vector Store.

    This is a thin wrapper around CoreAnnotationVectorStore that implements
    the LlamaIndex BasePydanticVectorStore interface.

    Args:
        user_id: Filter by user ID
        corpus_id: Filter by corpus ID
        document_id: Filter by document ID
        must_have_text: Filter by text content
        embed_dim: Embedding dimension to use (384, 768, 1536, or 3072)
        embedder_path: Path to embedder model to use
    """

    stores_text: bool = True
    flat_metadata: bool = False

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
        # Initialize the Pydantic model
        super().__init__(
            stores_text=True,
            flat_metadata=False,
        )
        
        # Initialize our core vector store
        self._core_store = CoreAnnotationVectorStore(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            embedder_path=embedder_path,
            must_have_text=must_have_text,
            embed_dim=embed_dim,
        )

    async def close(self) -> None:
        """Close the vector store."""
        return

    @classmethod
    def class_name(cls) -> str:
        """Return the class name."""
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
        """Create instance from parameters."""
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

    def _convert_metadata_filters(self, filters: Optional[MetadataFilters]) -> Optional[dict[str, Any]]:
        """Convert LlamaIndex MetadataFilters to our internal format."""
        if not filters or not filters.filters:
            return None

        result = {}
        for filter_ in filters.filters:
            if isinstance(filter_, MetadataFilter):
                result[filter_.key] = filter_.value
            
        return result

    def _convert_to_text_nodes(self, results: list) -> list[TextNode]:
        """Convert our search results to LlamaIndex TextNodes."""
        nodes = []
        for result in results:
            annotation = result.annotation
            node = TextNode(
                doc_id=str(annotation.id),
                text=annotation.raw_text if isinstance(annotation.raw_text, str) else "",
                embedding=annotation.embedding.tolist()
                if getattr(annotation, "embedding", None) is not None
                else [],
                extra_info={
                    "page": annotation.page,
                    "json": annotation.json,
                    "bounding_box": annotation.bounding_box,
                    "annotation_id": annotation.id,
                    "label": annotation.annotation_label.text
                    if annotation.annotation_label
                    else None,
                    "label_id": annotation.annotation_label.id
                    if annotation.annotation_label
                    else None,
                },
            )
            nodes.append(node)
        return nodes

    @property
    def client(self) -> None:
        """Return None since we use Django ORM instead of a separate client."""
        return None

    def add(self, nodes: list[BaseNode], **add_kwargs: Any) -> list[str]:
        """We don't support adding nodes via LlamaIndex."""
        return []

    async def async_add(self, nodes: list[BaseNode], **kwargs: Any) -> list[str]:
        """Add nodes asynchronously."""
        return self.add(nodes, **kwargs)

    def delete(self, doc_id: str, **delete_kwargs: Any) -> None:
        """We don't support deletion via LlamaIndex."""
        pass

    def query(self, query: VectorStoreQuery) -> VectorStoreQueryResult:
        """Execute a vector search query using our core store."""
        # Convert LlamaIndex query to our internal format
        search_query = VectorSearchQuery(
            query_text=query.query_str,
            query_embedding=query.query_embedding,
            similarity_top_k=query.similarity_top_k or 100,
            filters=self._convert_metadata_filters(query.filters),
        )

        # Execute search using core store
        results = self._core_store.search(search_query)
        
        # Convert results to LlamaIndex format
        nodes = self._convert_to_text_nodes(results)
        similarities = [result.similarity_score for result in results]
        ids = [str(result.annotation.id) for result in results]

        return VectorStoreQueryResult(
            nodes=nodes,
            similarities=similarities,
            ids=ids
        )

    async def aquery(
        self, query: VectorStoreQuery, **kwargs: Any
    ) -> VectorStoreQueryResult:
        """Asynchronous query wrapper."""
        return await database_sync_to_async(self.query)(query, **kwargs)
