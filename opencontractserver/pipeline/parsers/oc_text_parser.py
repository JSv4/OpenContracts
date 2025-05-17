import logging
from typing import Optional

import spacy
from django.core.files.storage import default_storage

from opencontractserver.annotations.models import SPAN_LABEL
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    AnnotationLabelPythonType,
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
)

logger = logging.getLogger(__name__)


class TxtParser(BaseParser):
    """
    Parser that processes plain text documents and splits them into sentences.
    """

    title = "Text Parser"
    description = "Parses plain text documents and splits them into sentences."
    author = "Your Name"
    dependencies = ["spacy"]
    supported_file_types = [FileTypeEnum.TXT]

    def __init__(self):
        """Initialize the spaCy language model."""
        super().__init__()
        self.nlp = spacy.load("en_core_web_lg")

    def _parse_document_impl(
        self, user_id: int, doc_id: int, **all_kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Parses a text document.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.
            **all_kwargs: Not used by this parser but included for consistency.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        logger.info(
            f"TxtParser - Parsing doc {doc_id} for user {user_id} with effective kwargs: {all_kwargs}"
        )

        document = Document.objects.get(pk=doc_id)

        if not document.txt_extract_file.name:
            logger.error(f"No txt file found for document {doc_id}")
            return None

        txt_path = document.txt_extract_file.name
        with default_storage.open(txt_path, mode="r") as txt_file:
            text_content = txt_file.read()

        doc = self.nlp(text_content)

        # Prepare the OpenContractDocExport
        open_contracts_data: OpenContractDocExport = {
            "title": document.title,
            "content": text_content,
            "description": document.description or "",
            "pawls_file_content": [],  # No PAWLS data for plain text
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

        # Normally, labels are saved in the database; for now we include the minimal info
        open_contracts_data["text_labels"] = {sentence_label_name: sentence_label}

        # Create the labelled_text annotations
        labelled_text: list[OpenContractsAnnotationPythonType] = []

        for sentence in doc.sents:
            annotation_entry: OpenContractsAnnotationPythonType = {
                "id": None,
                "annotationLabel": sentence_label_name,
                "rawText": sentence.text,
                "page": 1,
                "annotation_json": {
                    "start": sentence.start_char,
                    "end": sentence.end_char,
                },
                "parent_id": None,
                "annotation_type": "SPAN_LABEL",
                "structural": True,
            }
            labelled_text.append(annotation_entry)

        open_contracts_data["labelled_text"] = labelled_text

        return open_contracts_data
