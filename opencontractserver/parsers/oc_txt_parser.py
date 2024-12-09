from __future__ import annotations

import logging
from typing import Optional

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage

from opencontractserver.annotations.models import (
    SPAN_LABEL
)
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    AnnotationLabelPythonType,
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
    PawlsPagePythonType,
    PawlsTokenPythonType,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()

def parse_txt_document(user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
    """
    Parses a text document and returns an OpenContractDocExport object.

    This function reads the text content of a document, splits it into sentences using spaCy,
    and constructs an OpenContractDocExport object containing the parsed data. It creates
    annotations for each sentence and generates a minimal PAWLS file content to be used
    downstream.

    Args:
        user_id (int): The ID of the user.
        doc_id (int): The ID of the document to parse.

    Returns:
        Optional[OpenContractDocExport]: The parsed document data, or None if parsing fails.
    """
    import spacy

    logger.info(f"parse_txt_document() - parsing doc {doc_id} for user {user_id}")

    document = Document.objects.get(pk=doc_id)

    if not document.txt_extract_file.name:
        logger.error(f"No txt file found for document {doc_id}")
        return None

    txt_path = document.txt_extract_file.name
    with default_storage.open(txt_path, mode="r") as txt_file:
        text_content = txt_file.read()

    nlp = spacy.load("en_core_web_lg")
    doc = nlp(text_content)

    # Prepare the OpenContractDocExport
    open_contracts_data: OpenContractDocExport = {
        "title": document.title,
        "content": text_content,
        "description": document.description or "",
        "pawls_file_content": [],  # No PAWLs data
        "page_count": 1,  # Single page
        "doc_labels": [],
        "labelled_text": [],
    }

    # Create the SENTENCE label
    sentence_label_name = "SENTENCE"
    sentence_label: AnnotationLabelPythonType = {
        "id": None,  # ID will be assigned when saved to the database
        "color": "grey",
        "description": "Sentence",
        "icon": "expand",
        "text": sentence_label_name,
        "label_type": SPAN_LABEL,
        "parent_id": None,
    }

    open_contracts_data["text_labels"] = {
        sentence_label_name: sentence_label
    }

    # Create the labelled_text annotations
    labelled_text: list[OpenContractsAnnotationPythonType] = []

    for sentence in doc.sents:
        annotation_entry: OpenContractsAnnotationPythonType = {
            "id": None,
            "annotationLabel": sentence_label_name,
            "rawText": sentence.text,
            "page": 1,
            "annotation_json":{"start": sentence.start_char, "end": sentence.end_char},
            "parent_id": None,
        }
        labelled_text.append(annotation_entry)

    open_contracts_data["labelled_text"] = labelled_text

    return open_contracts_data

