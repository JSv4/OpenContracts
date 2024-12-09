import json
import logging
from typing import Callable, Dict, Optional

from django.core.files.base import ContentFile

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.types.dicts import OpenContractDocExport
from plasmapdf.models.PdfDataLayer import makePdfTranslationLayerFromPawlsTokens
from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
)
from opencontractserver.types.enums import PermissionTypes


logger = logging.getLogger(__name__)


def parse_document(
    user_id: int,
    doc_id: int,
    parse_function: Callable[[int, int], Optional[OpenContractDocExport]],
    label_type: str,
) -> None:
    """
    Parses a document and creates annotations using the specified parser function and annotation label.

    Args:
        user_id (int): ID of the user.
        doc_id (int): ID of the document to parse.
        parse_function (Callable): The function to use for parsing.
        annotation_label (str): The annotation label type to use (e.g., TOKEN_LABEL or SPAN_LABEL).

    Raises:
        Exception: If parsing fails.
    """
    logger.info(f"parse_document() - Parsing doc {doc_id} for user {user_id}")

    # Call the parser function to get OpenContractDocExport
    open_contracts_data = parse_function(user_id, doc_id)
    if open_contracts_data is None:
        raise Exception(f"Parser failed to parse document {doc_id}")

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

    existing_text_labels: Dict[str, AnnotationLabel] = {}

    # Annotate the document with any annotations from the parser
    for label_data in open_contracts_data["labelled_text"]:
        label_name = label_data["annotationLabel"]

        if label_name not in existing_text_labels:
            label_obj = AnnotationLabel.objects.filter(
                text=label_name,
                creator_id=user_id,
                label_type=label_type,
                read_only=True,
            ).first()
            print(f"label_obj: {label_obj}")
            if label_obj:
                existing_text_labels[label_name] = label_obj
            else:
                label_serializer = AnnotationLabelSerializer(
                    data={
                        "label_type": label_type,
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
                print(f"label_obj: {label_obj}")
                print(f"label_obj.id: {label_obj.creator}")
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
                annotation_type=label_type,
                structural=True,
        )
        annot_obj.save()
        set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

    logger.info(f"Document {doc_id} parsed successfully")
