from abc import ABC, abstractmethod
from typing import Optional, List
from django.core.files.base import File

class BaseThumbnailGenerator(ABC):
    """
    Abstract base class for thumbnail generators. Thumbnail generators should inherit from this class.
    """

    # Class property to register supported file types
    supported_file_types: List[str] = []

    @abstractmethod
    def generate_thumbnail(self, file_bytes: bytes) -> Optional[File]:
        """
        Abstract method to generate a thumbnail from file bytes.

        Args:
            file_bytes (bytes): The content of the file.

        Returns:
            Optional[File]: A Django File instance containing the thumbnail image, or None if an error occurs.
        """
        pass