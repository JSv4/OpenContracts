from abc import ABC, abstractmethod
from typing import Optional, List
from opencontractserver.pipeline.base.file_types import FileTypeEnum

class BaseEmbedder(ABC):
    """
    Abstract base class for embedders. Embedders should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: List[str] = []
    vector_size: int = 0  # Provide the data shape of the returned embeddings.
    supported_file_types: List[FileTypeEnum] = []

    @abstractmethod
    def embed_text(self, text: str) -> Optional[List[float]]:
        """
        Abstract method to generate embeddings from text.

        Args:
            text (str): The text content to embed.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if an error occurs.
        """
        pass