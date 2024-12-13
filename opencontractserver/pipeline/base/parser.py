from abc import ABC, abstractmethod
import json
import logging
from typing import Optional

from django.core.files.base import ContentFile
from plasmapdf.models.PdfDataLayer import makePdfTranslationLayerFromPawlsTokens

from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


class BaseParser(ABC):
    """
    Abstract base parser class. Parsers should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []

    @abstractmethod
    def parse_document(
        self, user_id: int, doc_id: int
    ) -> Optional[OpenContractDocExport]:
        """
        Abstract method to parse a document.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        pass

    def save_parsed_data(
        self, user_id: int, doc_id: int, open_contracts_data: OpenContractDocExport
    ) -> None:
        """
        Saves the parsed data to the Document model.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document.
            open_contracts_data (OpenContractDocExport): The parsed document data.
        """
        logger = logging.getLogger(__name__)
        logger.info(f"Saving parsed data for doc {doc_id}")

        document = Document.objects.get(pk=doc_id)

        # Save content to txt_extract_file
        txt_content = open_contracts_data.get("content", "")
        txt_file = ContentFile(txt_content.encode("utf-8"))
        document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)

        # Handle PAWLS content if any
        pawls_file_content = open_contracts_data.get("pawls_file_content")
        if pawls_file_content:
            pawls_string = json.dumps(pawls_file_content)
            pawls_file = ContentFile(pawls_string.encode("utf-8"))
            document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)

            # Create text layer from PAWLS tokens
            span_translation_layer = makePdfTranslationLayerFromPawlsTokens(
                json.loads(pawls_string)
            )
            # Optionally overwrite txt_extract_file with text from PAWLS
            txt_file = ContentFile(span_translation_layer.doc_text.encode("utf-8"))
            document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)
            document.page_count = len(pawls_file_content)
        else:
            # Handle cases without PAWLS content
            document.page_count = open_contracts_data.get("page_count", 1)

        document.save()

        existing_text_labels = {}

        # Annotate the document with any annotations from the parser
        for label_data in open_contracts_data.get("labelled_text", []):
            label_name = label_data["annotationLabel"]

            if label_name not in existing_text_labels:
                label_obj = AnnotationLabel.objects.filter(
                    text=label_name,
                    creator_id=user_id,
                    label_type=label_data.get("label_type", "SPAN_LABEL"),
                    read_only=True,
                ).first()

                if label_obj:
                    existing_text_labels[label_name] = label_obj
                else:
                    label_serializer = AnnotationLabelSerializer(
                        data={
                            "label_type": label_data.get("label_type", "SPAN_LABEL"),
                            "color": "grey",
                            "description": "Parser Structural Label",
                            "icon": "expand",
                            "text": label_name,
                            "creator_id": user_id,
                            "read_only": True,
                        }
                    )
                    label_serializer.is_valid(raise_exception=True)
                    label_obj = label_serializer.save()
                    set_permissions_for_obj_to_user(
                        user_id, label_obj, [PermissionTypes.ALL]
                    )
                    existing_text_labels[label_name] = label_obj
            else:
                label_obj = existing_text_labels[label_name]

            annot_obj = Annotation.objects.create(
                raw_text=label_data["rawText"],
                page=label_data.get("page", 1),
                json=label_data["annotation_json"],
                annotation_label=label_obj,
                document=document,
                creator_id=user_id,
                annotation_type=label_data.get("label_type", "SPAN_LABEL"),
                structural=True,
            )
            annot_obj.save()
            set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        logger.info(f"Document {doc_id} parsed and saved successfully")

    def process_document(self, user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
        """
        Process a document by parsing it and saving the parsed data.
        This method combines parse_document and save_parsed_data into a single operation.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to process.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        logger.info(f"Processing document {doc_id}")
        
        parsed_data = self.parse_document(user_id, doc_id)
        
        if parsed_data is not None:
            self.save_parsed_data(user_id, doc_id, parsed_data)
            logger.info(f"Document {doc_id} processed successfully")
        else:
            logger.warning(f"Document {doc_id} parsing failed")
        
        return parsed_data
