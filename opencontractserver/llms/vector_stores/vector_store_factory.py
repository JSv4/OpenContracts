"""Unified vector store factory that can create vector stores for different frameworks."""

import logging
from typing import Any, Optional, Union

from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
)

logger = logging.getLogger(__name__)


class UnifiedVectorStoreFactory:
    """Factory that creates vector stores using different frameworks with a common interface."""

    @staticmethod
    def create_vector_store(
        framework: AgentFramework = AgentFramework.PYDANTIC_AI,
        user_id: Optional[Union[str, int]] = None,
        corpus_id: Optional[Union[str, int]] = None,
        document_id: Optional[Union[str, int]] = None,
        embedder_path: Optional[str] = None,
        must_have_text: Optional[str] = None,
        embed_dim: int = 384,
        **kwargs,
    ) -> Any:
        """Create a vector store using the specified framework.

        Args:
            framework: Which framework to create the vector store for
            user_id: Filter by user ID
            corpus_id: Filter by corpus ID
            document_id: Filter by document ID
            embedder_path: Path to embedder model to use
            must_have_text: Filter by text content
            embed_dim: Embedding dimension to use (384, 768, 1536, or 3072)
            **kwargs: Additional framework-specific arguments

        Returns:
            Framework-specific vector store instance
        """
        if framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
                PydanticAIAnnotationVectorStore,
            )

            return PydanticAIAnnotationVectorStore(
                user_id=user_id,
                corpus_id=corpus_id,
                document_id=document_id,
                embedder_path=embedder_path,
                must_have_text=must_have_text,
                embed_dim=embed_dim,
                **kwargs,
            )
        else:
            raise ValueError(f"Unsupported framework: {framework}")

    @staticmethod
    def create_core_vector_store(
        user_id: Optional[Union[str, int]] = None,
        corpus_id: Optional[Union[str, int]] = None,
        document_id: Optional[Union[str, int]] = None,
        embedder_path: Optional[str] = None,
        must_have_text: Optional[str] = None,
        embed_dim: int = 384,
        **kwargs,
    ) -> CoreAnnotationVectorStore:
        """Create a framework-agnostic core vector store.

        Args:
            user_id: Filter by user ID
            corpus_id: Filter by corpus ID
            document_id: Filter by document ID
            embedder_path: Path to embedder model to use
            must_have_text: Filter by text content
            embed_dim: Embedding dimension to use (384, 768, 1536, or 3072)
            **kwargs: Additional arguments

        Returns:
            CoreAnnotationVectorStore: Framework-agnostic vector store
        """
        return CoreAnnotationVectorStore(
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            embedder_path=embedder_path,
            must_have_text=must_have_text,
            embed_dim=embed_dim,
        )


# Convenience functions for backward compatibility
def create_vector_store(
    framework: Union[AgentFramework, str] = AgentFramework.PYDANTIC_AI, **kwargs
) -> Any:
    """Create a vector store (backward compatibility wrapper)."""
    if isinstance(framework, str):
        framework = AgentFramework(framework)
    return UnifiedVectorStoreFactory.create_vector_store(framework, **kwargs)


def create_core_vector_store(**kwargs) -> CoreAnnotationVectorStore:
    """Create a core vector store (backward compatibility wrapper)."""
    return UnifiedVectorStoreFactory.create_core_vector_store(**kwargs)
