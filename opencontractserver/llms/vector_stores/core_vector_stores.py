"""Core vector store functionality independent of any specific agent framework."""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Optional, Union

from asgiref.sync import sync_to_async, async_to_sync
from django.db.models import QuerySet, Q

from opencontractserver.annotations.models import Annotation
from opencontractserver.utils.embeddings import (
    agenerate_embeddings_from_text,
    generate_embeddings_from_text,
    get_embedder,
)

_logger = logging.getLogger(__name__)


def _is_async_context() -> bool:
    """Check if we're currently running in an async context."""
    try:
        asyncio.current_task()
        return True
    except RuntimeError:
        return False


async def _safe_queryset_info(queryset: QuerySet, description: str) -> str:
    """Safely log queryset information in both sync and async contexts."""
    try:
        if _is_async_context():
            count = await sync_to_async(queryset.count)()
            return f"{description}: {count} results"
        else:
            return f"{description}: {queryset.count()} results"
    except Exception as e:
        return f"{description}: unable to count results ({e})"


def _safe_queryset_info_sync(queryset: QuerySet, description: str) -> str:
    """Safely log queryset information in sync context only."""
    if _is_async_context():
        return f"{description}: queryset (async context - count not available)"
    else:
        try:
            return f"{description}: {queryset.count()} results"
        except Exception as e:
            return f"{description}: unable to count results ({e})"


async def _safe_execute_queryset(queryset: QuerySet) -> list:
    """Safely execute a queryset in both sync and async contexts."""
    if _is_async_context():
        return await sync_to_async(list)(queryset)
    else:
        return list(queryset)


@dataclass
class VectorSearchQuery:
    """Framework-agnostic vector search query."""

    query_text: Optional[str] = None
    query_embedding: Optional[list[float]] = None
    similarity_top_k: int = 100
    filters: Optional[dict[str, Any]] = None


@dataclass
class VectorSearchResult:
    """Framework-agnostic vector search result."""

    annotation: Annotation
    similarity_score: float = 1.0


class CoreAnnotationVectorStore:
    """Core annotation vector store functionality independent of agent frameworks.

    This class encapsulates the business logic for searching annotations using
    vector embeddings and various filters. It operates directly with Django
    models and can be wrapped by different agent framework adapters.

    Args:
        user_id: Filter by user ID
        corpus_id: Filter by corpus ID
        document_id: Filter by document ID
        must_have_text: Filter by text content
        embedder_path: Path to embedder model to use
        embed_dim: Embedding dimension (384, 768, 1536, or 3072)
    """

    def __init__(
        self,
        user_id: Union[str, int, None] = None,
        corpus_id: Union[str, int, None] = None,
        document_id: Union[str, int, None] = None,
        embedder_path: Optional[str] = None,
        must_have_text: Optional[str] = None,
        embed_dim: int = 384,
    ):
        # ------------------------------------------------------------------ #
        # Validation – we need a corpus context unless the caller overrides
        # the embedder explicitly.
        # ------------------------------------------------------------------ #
        if embedder_path is None and corpus_id is None:
            raise ValueError(
                "CoreAnnotationVectorStore requires either 'corpus_id' to "
                "derive an embedder or an explicit 'embedder_path' override."
            )
        self.user_id = user_id
        self.corpus_id = corpus_id
        self.document_id = document_id
        self.must_have_text = must_have_text
        self.embed_dim = embed_dim

        # Auto-detect embedder configuration
        embedder_class, detected_embedder_path = get_embedder(
            corpus_id=corpus_id,
            embedder_path=embedder_path,
        )
        self.embedder_path = detected_embedder_path
        _logger.debug(f"Configured embedder path: {self.embedder_path}")

        # Validate or fallback dimension
        if self.embed_dim not in [384, 768, 1536, 3072]:
            self.embed_dim = getattr(embedder_class, "vector_size", 768)

    async def _build_base_queryset(self) -> QuerySet[Annotation]:
        """Build the base annotation queryset with standard filters."""
        _logger.debug("Building base queryset for vector search")

        # Select related for fields directly on Annotation or accessed often.
        # Document's M2M to Corpus (corpus_set) is handled by JOINs in filters.
        queryset = Annotation.objects.select_related("annotation_label", "document", "corpus").all()
        _logger.info(await _safe_queryset_info(queryset, "Initial: Total annotations in DB"))

        active_filters = Q()

        if self.document_id is not None:
            # --- Document-specific context ---
            _logger.debug(f"Document context: document_id={self.document_id}, corpus_id={self.corpus_id}")
            
            # 1. Annotations must belong to the specified document.
            active_filters &= Q(document_id=self.document_id)
            
            # 2. Optional corpus scoping: In most cases, higher-level logic ensures that
            #    the provided document belongs to the expected corpus. Performing an
            #    additional M2M join here (`document__corpus_set__id=...`) triggers a
            #    complex SQL path that can raise compatibility issues in some
            #    environments. We therefore rely on the higher-level validation and
            #    skip this join for performance and compatibility.
            #    If you absolutely need this validation in-query, consider adding an
            #    explicit check elsewhere (or revisiting this join once your DB
            #    supports the required traversal).
            
            # For document-specific context, once document validity within the corpus is confirmed,
            # both structural and non-structural annotations from that document are considered relevant
            # to this (document_id, corpus_id) pair. No additional filter on Annotation.corpus_id 
            # is applied here for corpus scoping, as the document's membership provides the link.

        elif self.corpus_id is not None:
            # --- Corpus-only context (no document_id specified) ---
            _logger.debug(f"Corpus-only context: corpus_id={self.corpus_id}")
            # Annotations must be either:
            # a) Structural (their Annotation.corpus_id might be null, included by nature)
            # b) Non-structural AND directly linked to this corpus via Annotation.corpus_id.
            active_filters &= (Q(structural=True) | Q(structural=False, corpus_id=self.corpus_id))
        
        # Apply accumulated document/corpus scope filters if any were added
        if active_filters != Q(): # Check if any conditions were actually added
            queryset = queryset.filter(active_filters)
            _logger.info(await _safe_queryset_info(queryset, "After document/corpus scoping"))
        else:
            _logger.info("No document/corpus scope filters applied (e.g., neither document_id nor corpus_id provided for scoping).")


        # --- Visibility / permission filters (applied to the already scoped queryset) ---
        # An annotation is visible if it's structural OR public OR created by the user.
        visibility_q = Q(structural=True) | Q(is_public=True)
        if self.user_id is not None:
            visibility_q |= Q(creator_id=self.user_id)
        
        _logger.debug(f"Applying visibility filter: {visibility_q}")
        queryset = queryset.filter(visibility_q)
        _logger.debug(f"Query after visibility filter: {queryset.query}")
        _logger.info(await _safe_queryset_info(queryset, "Annotations after visibility filtering"))

        # Print the SQL query for inspection
        print("-------------------- GENERATED SQL QUERY --------------------")
        print(str(queryset.query))
        print("-------------------------------------------------------------")

        return queryset

    def _apply_metadata_filters(
        self, queryset: QuerySet[Annotation], filters: Optional[dict[str, Any]]
    ) -> QuerySet[Annotation]:
        """Apply additional metadata filters to the queryset."""
        if not filters:
            return queryset

        _logger.debug(f"Applying metadata filters: {filters}")

        for key, value in filters.items():
            if key == "annotation_label":
                queryset = queryset.filter(annotation_label__text__icontains=value)
            elif key == "label":
                queryset = queryset.filter(annotation_label__text__iexact=value)
            else:
                # Generic filter fallback
                queryset = queryset.filter(**{f"{key}__icontains": value})

        _logger.debug(f"After metadata filters: {queryset.query}")
        return queryset

    def _generate_query_embedding(self, query_text: str) -> Optional[list[float]]:
        """Generate embeddings from query text synchronously."""
        _logger.debug(f"Generating embeddings from query string: '{query_text}'")
        _logger.debug(f"Using embedder path: {self.embedder_path}")

        embedder_path, vector = generate_embeddings_from_text(
            query_text,
            embedder_path=self.embedder_path,
        )

        _logger.debug(f"Generated embeddings using embedder: {embedder_path}")
        if vector is not None:
            _logger.debug(f"Vector dimension: {len(vector)}")
        else:
            _logger.warning("Failed to generate embeddings - vector is None")

        return vector

    async def _agenerate_query_embedding(
        self, query_text: str
    ) -> Optional[list[float]]:
        """Generate embeddings from query text asynchronously."""
        _logger.debug(f"Async generating embeddings from query string: '{query_text}'")
        _logger.debug(f"Using embedder path: {self.embedder_path}")

        embedder_path, vector = await agenerate_embeddings_from_text(
            query_text,
            embedder_path=self.embedder_path,
        )

        _logger.debug(f"Generated embeddings using embedder: {embedder_path}")
        if vector is not None:
            _logger.debug(f"Vector dimension: {len(vector)}")
        else:
            _logger.warning("Failed to generate embeddings - vector is None")

        return vector

    def search(self, query: VectorSearchQuery) -> list[VectorSearchResult]:
        """Execute a vector search query and return results.

        Args:
            query: The search query containing text/embedding and filters

        Returns:
            List of search results with annotations and similarity scores
        """
        # Build base queryset with filters
        queryset = async_to_sync(self._build_base_queryset)()

        # Apply metadata filters
        queryset = self._apply_metadata_filters(queryset, query.filters)

        # Determine the query vector
        vector = query.query_embedding
        if vector is None and query.query_text is not None:
            vector = self._generate_query_embedding(query.query_text)

        # Perform vector search if we have a valid embedding
        if vector is not None and len(vector) in [384, 768, 1536, 3072]:
            _logger.debug(f"Using vector search with dimension: {len(vector)}")
            _logger.debug(
                f"Performing vector search with embedder: {self.embedder_path}"
            )

            queryset = queryset.search_by_embedding(
                query_vector=vector,
                embedder_path=self.embedder_path,
                top_k=query.similarity_top_k,
            )
            _logger.debug(_safe_queryset_info_sync(queryset, "After vector search"))
        else:
            # Fallback to standard filtering with limit
            if vector is None:
                _logger.debug(
                    "No vector available for search, using standard filtering"
                )
            else:
                _logger.warning(
                    f"Invalid vector dimension: {len(vector)}, using standard filtering"
                )

            queryset = queryset[: query.similarity_top_k]
            _logger.debug(_safe_queryset_info_sync(queryset, "After limiting results"))

        # Execute query and convert to results
        _logger.debug("Fetching annotations from database")

        # Safe queryset execution for both sync and async contexts
        if _is_async_context():
            _logger.warning(
                "Sync method called from async context - this may cause issues"
            )
            # For now, we'll try the sync approach and let it fail gracefully
            try:
                annotations = list(queryset)
            except Exception as e:
                _logger.error(f"Failed to execute queryset in async context: {e}")
                return []
        else:
            annotations = list(queryset)

        _logger.debug(f"Retrieved {len(annotations)} annotations")

        if annotations:
            _logger.debug(f"First annotation ID: {annotations[0].id}")
            _logger.info(f"[CoreAnnotationVectorStore.search] Vector store returned {len(annotations)} annotations for query.")
        else:
            _logger.warning("No annotations found for the query")

        # Convert to result objects
        results = []
        for annotation in annotations:
            similarity_score = getattr(annotation, "similarity_score", 1.0)
            results.append(
                VectorSearchResult(
                    annotation=annotation, similarity_score=similarity_score
                )
            )

        return results

    async def async_search(self, query: VectorSearchQuery) -> list[VectorSearchResult]:
        """Async version of search that properly handles Django ORM in async context.

        Args:
            query: The search query containing text/embedding and filters

        Returns:
            List of search results with annotations and similarity scores
        """
        # Build base queryset with filters
        queryset = await self._build_base_queryset()

        # Apply metadata filters
        queryset = self._apply_metadata_filters(queryset, query.filters)

        # Determine the query vector
        vector = query.query_embedding
        if vector is None and query.query_text is not None:
            vector = await self._agenerate_query_embedding(query.query_text)

        # Perform vector search if we have a valid embedding
        if vector is not None and len(vector) in [384, 768, 1536, 3072]:
            _logger.debug(f"Using vector search with dimension: {len(vector)}")
            _logger.debug(
                f"Performing vector search with embedder: {self.embedder_path}"
            )

            queryset = queryset.search_by_embedding(
                query_vector=vector,
                embedder_path=self.embedder_path,
                top_k=query.similarity_top_k,
            )
            _logger.debug(await _safe_queryset_info(queryset, "After vector search"))
        else:
            # Fallback to standard filtering with limit
            if vector is None:
                _logger.debug(
                    "No vector available for search, using standard filtering"
                )
            else:
                _logger.warning(
                    f"Invalid vector dimension: {len(vector)}, using standard filtering"
                )

            queryset = queryset[: query.similarity_top_k]
            _logger.debug(await _safe_queryset_info(queryset, "After limiting results"))

        # Execute query and convert to results
        _logger.debug("Fetching annotations from database")
        annotations = await _safe_execute_queryset(queryset)
        _logger.debug(f"Retrieved {len(annotations)} annotations")

        if annotations:
            _logger.debug(f"First annotation ID: {annotations[0].id}")
            _logger.info(f"[CoreAnnotationVectorStore.async_search] Vector store returned {len(annotations)} annotations for query.")
        else:
            _logger.warning("No annotations found for the query")

        # Convert to result objects
        results = []
        for annotation in annotations:
            similarity_score = getattr(annotation, "similarity_score", 1.0)
            results.append(
                VectorSearchResult(
                    annotation=annotation, similarity_score=similarity_score
                )
            )

        return results
