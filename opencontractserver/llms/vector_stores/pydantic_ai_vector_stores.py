"""PydanticAI-specific vector store implementations."""

import logging
from typing import List, Optional, Union, Any, Dict
from channels.db import database_sync_to_async

from pydantic import BaseModel
from opencontractserver.llms.tools.pydantic_ai_tools import PydanticAIDependencies
from pydantic_ai import RunContext

from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
    VectorSearchQuery,
    VectorSearchResult,
)

logger = logging.getLogger(__name__)


class PydanticAIVectorSearchRequest(BaseModel):
    """Pydantic model for vector search requests in PydanticAI context."""
    
    query_text: Optional[str] = None
    query_embedding: Optional[List[float]] = None
    similarity_top_k: int = 10
    filters: Optional[Dict[str, Any]] = None


class PydanticAIVectorSearchResponse(BaseModel):
    """Pydantic model for vector search responses in PydanticAI context."""
    
    results: List[Dict[str, Any]]
    total_results: int
    
    @classmethod
    def from_core_results(cls, results: List[VectorSearchResult]) -> "PydanticAIVectorSearchResponse":
        """Create response from core vector search results.
        
        Args:
            results: List of VectorSearchResult instances
            
        Returns:
            PydanticAIVectorSearchResponse instance
        """
        formatted_results = []
        for result in results:
            formatted_result = {
                "annotation_id": result.annotation.id,
                "content": result.annotation.raw_text,
                "document_id": result.annotation.document_id,
                "corpus_id": result.annotation.corpus_id,
                "similarity_score": result.similarity_score,
                "annotation_label": result.annotation.annotation_label.text if result.annotation.annotation_label else None,
                "page": result.annotation.page,
                "bounds": {
                    "top": result.annotation.bounding_box.top if result.annotation.bounding_box else None,
                    "bottom": result.annotation.bounding_box.bottom if result.annotation.bounding_box else None,
                    "left": result.annotation.bounding_box.left if result.annotation.bounding_box else None,
                    "right": result.annotation.bounding_box.right if result.annotation.bounding_box else None,
                } if result.annotation.bounding_box else None,
            }
            formatted_results.append(formatted_result)
        
        return cls(
            results=formatted_results,
            total_results=len(formatted_results)
        )

    @classmethod
    async def async_from_core_results(cls, results: List[VectorSearchResult]) -> "PydanticAIVectorSearchResponse":
        """Async version that safely accesses Django model attributes.
        
        Args:
            results: List of VectorSearchResult instances
            
        Returns:
            PydanticAIVectorSearchResponse instance
        """
        @database_sync_to_async
        def extract_annotation_data(annotation) -> Dict[str, Any]:
            """Extract annotation data safely in async context."""
            return {
                "annotation_id": annotation.id,
                "content": annotation.raw_text,
                "document_id": annotation.document_id,
                "corpus_id": annotation.corpus_id,
                "page": annotation.page,
                "annotation_label": annotation.annotation_label.text if annotation.annotation_label else None,
                "bounds": {
                    "top": _bb_value(annotation.bounding_box, "top"),
                    "bottom": _bb_value(annotation.bounding_box, "bottom"),
                    "left": _bb_value(annotation.bounding_box, "left"),
                    "right": _bb_value(annotation.bounding_box, "right"),
                } if annotation.bounding_box else None,
            }
        
        formatted_results = []
        for result in results:
            annotation_data = await extract_annotation_data(result.annotation)
            annotation_data["similarity_score"] = result.similarity_score
            formatted_results.append(annotation_data)
        
        return cls(
            results=formatted_results,
            total_results=len(formatted_results)
        )


class PydanticAIAnnotationVectorStore:
    """PydanticAI-compatible wrapper for CoreAnnotationVectorStore.
    
    This class adapts the core vector store functionality for use with PydanticAI
    agents, providing async methods and proper type hints.
    """

    def __init__(
        self,
        user_id: Optional[Union[str, int]] = None,
        corpus_id: Optional[Union[str, int]] = None,
        document_id: Optional[Union[str, int]] = None,
        embedder_path: Optional[str] = None,
        must_have_text: Optional[str] = None,
        embed_dim: int = 384,
        **kwargs
    ):
        """Initialize the PydanticAI vector store wrapper.
        
        Args:
            user_id: Filter by user ID
            corpus_id: Filter by corpus ID
            document_id: Filter by document ID
            embedder_path: Path to embedder model to use
            must_have_text: Filter by text content
            embed_dim: Embedding dimension (384, 768, 1536, or 3072)
            **kwargs: Additional arguments passed to core store
        """
        self.core_store = CoreAnnotationVectorStore(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            embedder_path=embedder_path,
            must_have_text=must_have_text,
            embed_dim=embed_dim,
        )
        
        # Store initialization parameters for tool use
        self.user_id = user_id
        self.corpus_id = corpus_id
        self.document_id = document_id
        self.embedder_path = embedder_path

    async def search_annotations(
        self,
        query_text: Optional[str] = None,
        query_embedding: Optional[List[float]] = None,
        similarity_top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> PydanticAIVectorSearchResponse:
        """Search annotations using vector similarity.
        
        Args:
            query_text: Text query for semantic search
            query_embedding: Pre-computed embedding vector
            similarity_top_k: Maximum number of results to return
            filters: Additional metadata filters
            
        Returns:
            PydanticAIVectorSearchResponse with search results
        """
        logger.debug(f"PydanticAI vector search: query_text='{query_text}', top_k={similarity_top_k}")
        
        # Create search query
        search_query = VectorSearchQuery(
            query_text=query_text,
            query_embedding=query_embedding,
            similarity_top_k=similarity_top_k,
            filters=filters
        )
        
        # Execute search using core store's async method
        results = await self.core_store.async_search(search_query)
        
        logger.debug(f"Found {len(results)} annotations")
        
        # Convert to PydanticAI response format using async method
        return await PydanticAIVectorSearchResponse.async_from_core_results(results)

    def search_sync(
        self,
        query_text: Optional[str] = None,
        query_embedding: Optional[List[float]] = None,
        similarity_top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> PydanticAIVectorSearchResponse:
        """Synchronous search method for backward compatibility.
        
        Args:
            query_text: Text query for semantic search
            query_embedding: Pre-computed embedding vector
            similarity_top_k: Maximum number of results to return
            filters: Additional metadata filters
            
        Returns:
            PydanticAIVectorSearchResponse with search results
        """
        # Create search query
        search_query = VectorSearchQuery(
            query_text=query_text,
            query_embedding=query_embedding,
            similarity_top_k=similarity_top_k,
            filters=filters
        )
        
        # Execute search using core store
        results = self.core_store.search(search_query)
        
        # Convert to PydanticAI response format
        return PydanticAIVectorSearchResponse.from_core_results(results)

    def get_store_info(self) -> Dict[str, Any]:
        """Get information about the vector store configuration.
        
        Returns:
            Dictionary with store configuration details
        """
        return {
            "user_id": self.user_id,
            "corpus_id": self.corpus_id,
            "document_id": self.document_id,
            "embedder_path": self.embedder_path,
            "embed_dim": self.core_store.embed_dim,
        }

    async def create_vector_search_tool(self) -> callable:
        """Create a PydanticAI-compatible tool function for vector search.
        
        Returns:
            Async function that can be used as a PydanticAI tool
        """
        async def vector_search_tool(
            ctx: RunContext[PydanticAIDependencies],  # Updated annotation
            query_text: str,
            similarity_top_k: int = 10,
            filters: Optional[Dict[str, Any]] = None
        ) -> Dict[str, Any]:
            """Search annotations using vector similarity.
            
            Args:
                ctx: PydanticAI run context. Provides access to dependencies via ctx.deps.
                query_text: Text query for semantic search
                similarity_top_k: Maximum number of results to return
                filters: Additional metadata filters
                
            Returns:
                Dictionary containing search results
            """
            response = await self.search_annotations(
                query_text=query_text,
                similarity_top_k=similarity_top_k,
                filters=filters
            )
            return response.model_dump()
        
        # Set proper metadata for PydanticAI
        vector_search_tool.__name__ = "vector_search"
        vector_search_tool.__doc__ = "Search document annotations using vector similarity"
        
        return vector_search_tool

    def __repr__(self) -> str:
        """String representation of the vector store."""
        return (
            f"PydanticAIAnnotationVectorStore("
            f"document_id={self.document_id}, "
            f"corpus_id={self.corpus_id}, "
            f"user_id={self.user_id})"
        )


# Convenience function for creating PydanticAI vector search tools
async def create_vector_search_tool(
    user_id: Optional[Union[str, int]] = None,
    corpus_id: Optional[Union[str, int]] = None,
    document_id: Optional[Union[str, int]] = None,
    embedder_path: Optional[str] = None,
    **kwargs
) -> callable:
    """Create a vector search tool for PydanticAI agents.
    
    Args:
        user_id: Filter by user ID
        corpus_id: Filter by corpus ID  
        document_id: Filter by document ID
        embedder_path: Path to embedder model to use
        **kwargs: Additional arguments
        
    Returns:
        Async function that can be used as a PydanticAI tool
    """
    vector_store = PydanticAIAnnotationVectorStore(
        user_id=user_id,
        corpus_id=corpus_id,
        document_id=document_id,
        embedder_path=embedder_path,
        **kwargs
    )
    
    return await vector_store.create_vector_search_tool()


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def _bb_value(bb: object | None, key: str):
    """
    Robustly extract a single coordinate from a bounding-box that may be a
    plain dict **or** an object with attributes.
    """
    if bb is None:
        return None
    if isinstance(bb, dict):
        return bb.get(key)
    # Fall-back to attribute access
    return getattr(bb, key, None) 