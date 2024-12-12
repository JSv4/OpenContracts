from __future__ import annotations

import logging
from typing import Optional, List

from django.core.files.storage import default_storage

from opencontractserver.types.dicts import (
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
)

from opencontractserver.parsers.base import BaseParser

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class OcTxtParser(BaseParser):
    """
    Parser for text documents.
    """

    supported_file_types: List[str] = ['application/txt']

    def parse_document(self, user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
        """
        Parses a text document and returns the OpenContractDocExport data.

        Args:
            user_id (int): The ID of the user.
            doc_id (int): The ID of the document to parse.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        import spacy
        from spacy.lang.en import English
        from opencontractserver.documents.models import Document

        document = Document.objects.get(pk=doc_id)

        if not document.document_file:
            logger.error(f"No document file found for doc {doc_id}")
            return None

        file_object = default_storage.open(document.document_file.name)

        content = file_object.read().decode('utf-8')

        nlp = English()
        nlp.add_pipe('sentencizer')
        doc = nlp(content)

        open_contracts_data: OpenContractDocExport = {
            "title": document.name,
            "content": content,
            "description": None,
            "pawls_file_content": [],  # No page layout for TXT files
            "page_count": 1,
            "doc_labels": [],
            "labelled_text": [],
        }

        # Create the SENTENCE label
        sentence_label_name = "SENTENCE"
        sentence_label = {
            "id": None,
            "color": "grey",
            "description": "Sentence",
            "icon": "expand",
            "text": sentence_label_name,
            "label_type": "SPAN_LABEL",
            "parent_id": None,
        }

        open_contracts_data["text_labels"] = {
            sentence_label_name: sentence_label
        }

        # Create the labelled_text annotations
        labelled_text: List[OpenContractsAnnotationPythonType] = []

        for sentence in doc.sents:
            annotation_entry: OpenContractsAnnotationPythonType = {
                "id": None,
                "annotationLabel": sentence_label_name,
                "rawText": sentence.text,
                "page": 1,
                "annotation_json": {"start": sentence.start_char, "end": sentence.end_char},
                "parent_id": None,
            }
            labelled_text.append(annotation_entry)

        open_contracts_data["labelled_text"] = labelled_text

        # Now save the parsed data
        self.save_parsed_data(user_id, doc_id, open_contracts_data)

        return open_contracts_data