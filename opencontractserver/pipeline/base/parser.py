from abc import ABC, abstractmethod
from typing import Optional, List
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.dicts import OpenContractDocExport

class BaseParser(ABC):
    """
    Abstract base parser class. Parsers should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: List[str] = []
    supported_file_types: List[FileTypeEnum] = []

    @abstractmethod
    def parse_document(self, user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
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
        self,
        user_id: int,
        doc_id: int,
        open_contracts_data: OpenContractDocExport
    ) -> None:
        """
        Saves the parsed data to the Document model.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document.
            open_contracts_data (OpenContractDocExport): The parsed document data.
        """
        import json
        import logging
        from django.core.files.base import ContentFile
        from opencontractserver.documents.models import Document
        from opencontractserver.annotations.models import Annotation, AnnotationLabel
        from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
        from config.graphql.serializers import AnnotationLabelSerializer
        from opencontractserver.types.enums import PermissionTypes
        from plasmapdf.models.PdfDataLayer import makePdfTranslationLayerFromPawlsTokens

        logger = logging.getLogger(__name__)

        logger.info(f"Saving parsed data for doc {doc_id}")

        document = Document.objects.get(pk=doc_id)

        # Get PAWLS layer and text contents
        pawls_string = json.dumps(open_contracts_data["pawls_file_content"])
        pawls_file = ContentFile(pawls_string.encode("utf-8"))

        # Create text layer from PAWLS tokens
        span_translation_layer = makePdfTranslationLayerFromPawlsTokens(
            json.loads(pawls_string)
        )
        txt_file = ContentFile(span_translation_layer.doc_text.encode("utf-8"))

        # Save parsed data to the document
        document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)
        document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)
        document.page_count = len(open_contracts_data["pawls_file_content"])
        document.save()

        existing_text_labels = {}

        # Annotate the document with any annotations from the parser
        for label_data in open_contracts_data.get("labelled_text", []):
            label_name = label_data["annotationLabel"]

            if label_name not in existing_text_labels:
                label_obj = AnnotationLabel.objects.filter(
                    text=label_name,
                    creator_id=user_id,
                    label_type=label_data.get("label_type", "TOKEN_LABEL"),
                    read_only=True,
                ).first()

                if label_obj:
                    existing_text_labels[label_name] = label_obj
                else:
                    label_serializer = AnnotationLabelSerializer(
                        data={
                            "label_type": label_data.get("label_type", "TOKEN_LABEL"),
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
                page=label_data["page"],
                json=label_data["annotation_json"],
                annotation_label=label_obj,
                document=document,
                creator_id=user_id,
                annotation_type=label_data.get("label_type", "TOKEN_LABEL"),
                structural=True,
            )
            annot_obj.save()
            set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        logger.info(f"Document {doc_id} parsed and saved successfully")