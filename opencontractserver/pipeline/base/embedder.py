from abc import ABC, abstractmethod
from typing import Optional, List

class BaseEmbedder(ABC):
    """
    Abstract base class for embedders. Embedders should inherit from this class.
    """

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