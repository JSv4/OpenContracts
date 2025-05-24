"""
OpenContracts LLM Vector Stores Package

This package provides framework-agnostic vector store interfaces and framework-specific implementations.
"""

from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
    VectorSearchQuery,
    VectorSearchResult,
)
from opencontractserver.llms.vector_stores.vector_store_factory import (
    UnifiedVectorStoreFactory,
    create_vector_store,
    create_core_vector_store,
)

__all__ = [
    # Core interfaces
    "CoreAnnotationVectorStore",
    "VectorSearchQuery",
    "VectorSearchResult",
    # Factory
    "UnifiedVectorStoreFactory",
    "create_vector_store", 
    "create_core_vector_store",
]
