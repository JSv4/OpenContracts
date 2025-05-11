from abc import ABC, abstractmethod
from typing import Mapping, Optional, Tuple
import logging

from django.core.files.base import File

from opencontractserver.pipeline.base.file_types import FileTypeEnum
from .base_component import PipelineComponentBase

logger = logging.getLogger(__name__)

class BaseThumbnailGenerator(PipelineComponentBase, ABC):
    """
    Abstract base class for thumbnail generators. Thumbnail generators should inherit from this class.
    Handles automatic loading of settings from Django settings.PIPELINE_SETTINGS.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []
    input_schema: Mapping = (
        {}
    )  # If you want user to provide inputs, define a jsonschema here

    def __init__(self, **kwargs):
        """
        Initializes the Thumbnailer.
        Kwargs are passed to the superclass constructor (PipelineComponentBase).
        """
        super().__init__(**kwargs)

    @abstractmethod
    def _generate_thumbnail_impl(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
        **all_kwargs
    ) -> Optional[Tuple[bytes, str]]:
        """
        Abstract internal method to generate a thumbnail from txt content and pdf bytes.
        Concrete subclasses must implement this method.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.
            **all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS (e.g., height, width) and direct call-time arguments.

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """
        pass

    def generate_thumbnail(
        self, 
        txt_content: Optional[str], 
        pdf_bytes: Optional[bytes], 
        **direct_kwargs
    ) -> Optional[Tuple[bytes, str]]:
        """
        Generates a thumbnail from txt content and pdf bytes, injecting settings.
        The caller is responsible for saving the returned bytes as a file.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.
            **direct_kwargs: Arbitrary keyword arguments that may be provided
                             for specific thumbnailer functionalities at call time.
                             These will override settings from PIPELINE_SETTINGS (e.g. height, width).

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """
        # Default height and width can be part of component_settings or direct_kwargs
        default_dimensions = {"height": 300, "width": 300}
        component_settings = self.get_component_settings()

        # Merge order: defaults, then PIPELINE_SETTINGS, then direct_kwargs
        merged_kwargs = {**default_dimensions, **component_settings, **direct_kwargs}
        
        logger.info(
            f"Calling _generate_thumbnail_impl with merged kwargs: {merged_kwargs}"
        )
        return self._generate_thumbnail_impl(txt_content, pdf_bytes, **merged_kwargs)
