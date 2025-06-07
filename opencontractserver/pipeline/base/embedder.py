import logging
from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Optional

from opencontractserver.pipeline.base.file_types import FileTypeEnum

from .base_component import PipelineComponentBase

logger = logging.getLogger(__name__)


class BaseEmbedder(PipelineComponentBase, ABC):
    """
    Abstract base class for embedders. Embedders should inherit from this class.
    Handles automatic loading of settings from Django settings.PIPELINE_SETTINGS.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    vector_size: int = 0  # Provide the data shape of the returned embeddings.
    supported_file_types: list[FileTypeEnum] = []
    input_schema: Mapping = (
        {}
    )  # If you want user to provide inputs, define a jsonschema here

    def __init__(self, **kwargs):
        """
        Initializes the Embedder.
        Kwargs are passed to the superclass constructor (PipelineComponentBase).
        """
        super().__init__(**kwargs)

    @abstractmethod
    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Abstract internal method to generate embeddings from text.
        Concrete subclasses must implement this method.

        Args:
            text (str): The text content to embed.
            **all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS and direct call-time arguments.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if an error occurs.
        """
        pass

    def embed_text(self, text: str, **direct_kwargs) -> Optional[list[float]]:
        """
        Generates embeddings from text, automatically injecting settings from PIPELINE_SETTINGS.

        Args:
            text (str): The text content to embed.
            **direct_kwargs: Arbitrary keyword arguments that may be provided
                             for specific embedder functionalities at call time.
                             These will override settings from PIPELINE_SETTINGS.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if an error occurs.
        """
        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}
        logger.info(f"Calling _embed_text_impl with merged kwargs: {merged_kwargs}")
        return self._embed_text_impl(text, **merged_kwargs)
