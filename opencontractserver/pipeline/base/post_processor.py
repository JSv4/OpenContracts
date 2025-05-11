"""Base class for post-processors that can modify export data before it is packaged."""

from abc import ABC, abstractmethod
from typing import Mapping, Tuple
import logging

from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType
from .base_component import PipelineComponentBase

logger = logging.getLogger(__name__)

class BasePostProcessor(PipelineComponentBase, ABC):
    """
    Base class for post-processors that can modify export data before it is packaged.
    Post-processors are run in sequence, with each processor receiving the output of the previous one.
    Handles automatic loading of settings from Django settings.PIPELINE_SETTINGS.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    input_schema: Mapping = (
        {}
    )  # If you want user to provide inputs, define a jsonschema here

    def __init__(self, **kwargs):
        """
        Initializes the PostProcessor.
        Kwargs are passed to the superclass constructor (PipelineComponentBase).
        """
        super().__init__(**kwargs)

    @abstractmethod
    def _process_export_impl(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
        **all_kwargs
    ) -> Tuple[bytes, OpenContractsExportDataJsonPythonType]:
        """
        Abstract internal method to process the export data and return modified versions.
        Concrete subclasses must implement this method.

        Args:
            zip_bytes: The raw bytes of the zip file being created
            export_data: The export data dictionary that will be serialized to data.json
            **all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS and direct call-time arguments.

        Returns:
            Tuple containing:
                - Modified zip bytes
                - Modified export data dictionary
        """
        pass

    def process_export(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
        **direct_kwargs
    ) -> Tuple[bytes, OpenContractsExportDataJsonPythonType]:
        """
        Processes the export data, automatically injecting settings from PIPELINE_SETTINGS.

        Args:
            zip_bytes: The raw bytes of the zip file being created
            export_data: The export data dictionary that will be serialized to data.json
            **direct_kwargs: Arbitrary keyword arguments that may be provided
                             for specific post-processor functionalities at call time.
                             These will override settings from PIPELINE_SETTINGS.

        Returns:
            Tuple containing:
                - Modified zip bytes
                - Modified export data dictionary
        """
        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}
        logger.info(
            f"Calling _process_export_impl with merged kwargs: {merged_kwargs}"
        )
        return self._process_export_impl(zip_bytes, export_data, **merged_kwargs)
