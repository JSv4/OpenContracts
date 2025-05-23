"""Core vector store functionality independent of any specific agent framework."""

import logging
from typing import Any, Optional, Union
from dataclasses import dataclass

from django.db.models import QuerySet

from opencontractserver.annotations.models import Annotation
from opencontractserver.shared.resolvers import resolve_oc_model_queryset
from opencontractserver.utils.embeddings import (
    generate_embeddings_from_text,
    get_embedder,
)

_logger = logging.getLogger(__name__)


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
        _logger.info(f"Configured embedder path: {self.embedder_path}")
        
        # Validate or fallback dimension
        if self.embed_dim not in [384, 768, 1536, 3072]:
            self.embed_dim = getattr(embedder_class, "vector_size", 768)

    def _build_base_queryset(self) -> QuerySet[Annotation]:
        """Build the base annotation queryset with standard filters."""
        _logger.info("Building base queryset for vector search")
        
        # Start with all annotations
        queryset = Annotation.objects.all()
        _logger.info(f"Initial queryset: {queryset.query}")

        # Apply instance-level filters
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

        return queryset

    def _apply_metadata_filters(
        self, 
        queryset: QuerySet[Annotation], 
        filters: Optional[dict[str, Any]]
    ) -> QuerySet[Annotation]:
        """Apply additional metadata filters to the queryset."""
        if not filters:
            return queryset

        _logger.info(f"Applying metadata filters: {filters}")
        
        for key, value in filters.items():
            if key == "annotation_label":
                queryset = queryset.filter(annotation_label__text__icontains=value)
            elif key == "label":
                queryset = queryset.filter(annotation_label__text__iexact=value)
            else:
                # Generic filter fallback
                queryset = queryset.filter(**{f"{key}__icontains": value})
        
        _logger.info(f"After metadata filters: {queryset.query}")
        return queryset

    def _generate_query_embedding(self, query_text: str) -> Optional[list[float]]:
        """Generate embeddings from query text."""
        _logger.info(f"Generating embeddings from query string: '{query_text}'")
        _logger.info(f"Using embedder path: {self.embedder_path}")
        
        embedder_path, vector = generate_embeddings_from_text(
            query_text,
            embedder_path=self.embedder_path,
        )
        
        _logger.info(f"Generated embeddings using embedder: {embedder_path}")
        if vector is not None:
            _logger.info(f"Vector dimension: {len(vector)}")
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
        queryset = self._build_base_queryset()
        
        # Apply metadata filters
        queryset = self._apply_metadata_filters(queryset, query.filters)
        
        # Determine the query vector
        vector = query.query_embedding
        if vector is None and query.query_text is not None:
            vector = self._generate_query_embedding(query.query_text)

        # Perform vector search if we have a valid embedding
        if vector is not None and len(vector) in [384, 768, 1536, 3072]:
            _logger.info(f"Using vector search with dimension: {len(vector)}")
            _logger.info(f"Performing vector search with embedder: {self.embedder_path}")
            
            queryset = queryset.search_by_embedding(
                query_vector=vector, 
                embedder_path=self.embedder_path, 
                top_k=query.similarity_top_k
            )
            _logger.info(f"After vector search: {queryset}")
        else:
            # Fallback to standard filtering with limit
            if vector is None:
                _logger.info("No vector available for search, using standard filtering")
            else:
                _logger.warning(
                    f"Invalid vector dimension: {len(vector)}, using standard filtering"
                )
            
            queryset = queryset[:query.similarity_top_k]
            _logger.info(f"After limiting results: {queryset}")

        # Execute query and convert to results
        _logger.info("Fetching annotations from database")
        annotations = list(queryset)
        _logger.info(f"Retrieved {len(annotations)} annotations")
        
        if annotations:
            _logger.info(f"First annotation ID: {annotations[0].id}")
        else:
            _logger.warning("No annotations found for the query")

        # Convert to result objects
        results = []
        for annotation in annotations:
            similarity_score = getattr(annotation, "similarity_score", 1.0)
            results.append(VectorSearchResult(
                annotation=annotation,
                similarity_score=similarity_score
            ))
        
        return results 