from abc import ABC, abstractmethod
from typing import Optional

from django.core.files.base import File

from opencontractserver.pipeline.base.file_types import FileTypeEnum


class BaseThumbnailGenerator(ABC):
    """
    Abstract base class for thumbnail generators. Thumbnail generators should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []  # Now using an enum for file types.

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
