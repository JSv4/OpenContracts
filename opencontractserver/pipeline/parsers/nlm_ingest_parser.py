import logging
from typing import Optional

import requests
from django.core.files.storage import default_storage

from opencontractserver.annotations.models import TOKEN_LABEL
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.utils.files import check_if_pdf_needs_ocr

logger = logging.getLogger(__name__)


class NLMIngestParser(BaseParser):
    """
    Parser that uses the NLM ingest service to parse PDF documents.
    """

    title = "NLM Ingest Parser"
    description = "Parses PDF documents using the NLM ingest service."
    author = "Your Name"
    dependencies = []
    supported_file_types = [FileTypeEnum.PDF]

    def parse_document(
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Parses a document using the NLM ingest service and ensures that all annotations
        have 'structural' set to True and 'annotation_type' set to SPAN_LABEL.

        Now, we load configuration from **kwargs, falling back to Django settings if not provided.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.
            **kwargs: Parser configuration arguments such as 'endpoint', 'api_key', and 'use_ocr'.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data,
            or None if parsing failed.
        """
        logger.info(f"NLMIngestParser - Parsing doc {doc_id} for user {user_id}")

        # Retrieve config from kwargs or fallback to settings
        endpoint = kwargs.get("endpoint", "http://nlm-ingestor:5001")
        api_key = kwargs.get("api_key", "")
        use_ocr_config = kwargs.get("use_ocr", False)

        # Retrieve the document
        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        # Open the document file
        with default_storage.open(doc_path, "rb") as doc_file:
            # Check if OCR is needed
            needs_ocr = check_if_pdf_needs_ocr(doc_file)
            logger.debug(f"Document {doc_id} needs OCR: {needs_ocr}")

            # Prepare request headers
            logger.info(f"Using NLM API key: {api_key}")
            headers = {"API_KEY": api_key} if api_key else {}
            logger.info(f"Using NLM headers: {headers}")

            # Reset file pointer
            doc_file.seek(0)

            # Prepare request files and parameters
            files = {"file": doc_file}
            params = {
                "calculate_opencontracts_data": "yes",
                "applyOcr": "yes" if (needs_ocr and use_ocr_config) else "no",
            }

            # Make the POST request to the NLM ingest service
            response = requests.post(
                f"{endpoint}/api/parseDocument",
                headers=headers,
                files=files,
                params=params,
            )

        if response.status_code != 200:
            logger.error(
                f"NLM ingest service returned status code {response.status_code}"
            )
            response.raise_for_status()

        response_data = response.json()
        open_contracts_data: Optional[OpenContractDocExport] = response_data.get(
            "return_dict", {}
        ).get("opencontracts_data")

        if open_contracts_data is None:
            logger.error("No 'opencontracts_data' found in NLM ingest service response")
            return None

        # Ensure all annotations have 'structural' set to True and 'annotation_type' set to SPAN_LABEL
        if "labelled_text" in open_contracts_data:
            for annotation in open_contracts_data["labelled_text"]:
                annotation["structural"] = True
                annotation["annotation_type"] = TOKEN_LABEL

        logger.info(
            f"Open contracts data labelled text: {open_contracts_data.get('labelled_text', [])}"
        )

        return open_contracts_data
