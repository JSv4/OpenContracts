"""Base class for post-processors that can modify export data before it is packaged."""

from abc import ABC, abstractmethod
from typing import Tuple

from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType


class BasePostProcessor(ABC):
    """
    Base class for post-processors that can modify export data before it is packaged.
    Post-processors are run in sequence, with each processor receiving the output of the previous one.
    """

    @abstractmethod
    def process_export(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
    ) -> Tuple[bytes, OpenContractsExportDataJsonPythonType]:
        """
        Process the export data and return modified versions.

        Args:
            zip_bytes: The raw bytes of the zip file being created
            export_data: The export data dictionary that will be serialized to data.json

        Returns:
            Tuple containing:
                - Modified zip bytes
                - Modified export data dictionary
        """
        pass 