import logging
from typing import Optional

import requests
from django.conf import settings
from django.core.files.storage import default_storage

from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.utils.files import check_if_pdf_needs_ocr

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def parse_with_nlm(user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
    """
    Parses a document using the NLM ingest service.

    Args:
        user_id (int): The ID of the user.
        doc_id (int): The ID of the document to parse.

    Returns:
        Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
    """
    logger.info(f"parse_with_nlm() - Parsing doc {doc_id} for user {user_id}")

    # Retrieve the document
    doc = Document.objects.get(pk=doc_id)
    doc_path = doc.pdf_file.name
    doc_file = default_storage.open(doc_path, mode="rb")

    # Check if OCR is needed
    needs_ocr = check_if_pdf_needs_ocr(doc_file)
    logger.debug(f"Document {doc_id} needs OCR: {needs_ocr}")

    # Prepare request headers
    headers = {"API_KEY": settings.NLM_INGEST_API_KEY} if settings.NLM_INGEST_API_KEY else {}

    # Prepare request files and parameters
    files = {"file": doc_file}
    params = {
        "calculate_opencontracts_data": "yes",
        "applyOcr": "yes" if needs_ocr and settings.NLM_INGEST_USE_OCR else "no",
    }

    # Make the POST request to the NLM ingest service
    response = requests.post(
        f"{settings.NLM_INGEST_HOSTNAME}/api/parseDocument",
        headers=headers,
        files=files,
        params=params,
    )

    if response.status_code != 200:
        logger.error(f"NLM ingest service returned status code {response.status_code}")
        response.raise_for_status()

    response_data = response.json()
    open_contracts_data: Optional[OpenContractDocExport] = response_data.get("return_dict", {}).get("opencontracts_data")

    if open_contracts_data is None:
        logger.error("No 'opencontracts_data' found in NLM ingest service response")
        return None

    return open_contracts_data
