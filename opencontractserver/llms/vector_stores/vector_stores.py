"""
Backward compatibility module for vector stores.

This module provides backward compatibility by re-exporting the new
framework-specific vector store implementations.
"""

# Backward compatibility imports
from opencontractserver.llms.vector_stores.llama_index_vector_stores import (
    LlamaIndexAnnotationVectorStore,
    DjangoAnnotationVectorStore,  # Alias for backward compatibility
)
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
)
from opencontractserver.llms.vector_stores.vector_store_factory import (
    UnifiedVectorStoreFactory,
    create_vector_store,
    create_core_vector_store,
)

# Re-export everything for backward compatibility
__all__ = [
    "LlamaIndexAnnotationVectorStore",
    "DjangoAnnotationVectorStore",
    "PydanticAIAnnotationVectorStore", 
    "UnifiedVectorStoreFactory",
    "create_vector_store",
    "create_core_vector_store",
]
