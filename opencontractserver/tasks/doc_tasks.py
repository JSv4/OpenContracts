from __future__ import annotations

import enum
import json
import logging
from typing import Any

from django.contrib.auth import get_user_model
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.utils import timezone
from django.conf import settings
from pydantic import validate_arguments
from django.utils.module_loading import import_string

from config import celery_app
from opencontractserver.annotations.models import TOKEN_LABEL, Annotation
from opencontractserver.documents.models import Document
from opencontractserver.parsers.base_parser import parse_document
from opencontractserver.types.dicts import (
    FunsdAnnotationType,
    FunsdTokenType,
    LabelLookupPythonType,
    OpenContractDocExport,
    PawlsTokenPythonType,
)
from opencontractserver.utils.etl import build_document_export, pawls_bbox_to_funsd_box
from opencontractserver.utils.files import split_pdf_into_images
from opencontractserver.utils.importing import import_function_from_string
from opencontractserver.pipeline.utils import get_component_by_name

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


# CONSTANTS
class TaskStates(str, enum.Enum):
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"
    WARNING = "WARNING"


TEMP_DIR = "./tmp"


@celery_app.task()
def set_doc_lock_state(*args, locked: bool, doc_id: int):
    document = Document.objects.get(pk=doc_id)
    document.backend_lock = locked
    document.processing_finished = timezone.now()
    document.save()


@celery_app.task(bind=True)
def ingest_doc(self, user_id: int, doc_id: int) -> None:
    """
    Ingests a document using the appropriate parser based on the document's MIME type.
    The parser class is determined using get_component_by_name.

    Args:
        user_id (int): The ID of the user.
        doc_id (int): The ID of the document to ingest.

    Raises:
        ValueError: If no parser is defined for the document's MIME type.
        Exception: If parsing fails.
    """
    logger.info(f"ingest_doc() - Ingesting doc {doc_id} for user {user_id}")

    # Fetch the document
    try:
        document = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        logger.error(f"Document with id {doc_id} does not exist.")
        return

    # Get the parser class name from settings based on MIME type
    parser_name = settings.PREFERRED_PARSERS.get(document.file_type)
    if not parser_name:
        raise ValueError(f"No parser defined for MIME type '{document.file_type}'")

    # Get the parser class using get_component_by_name
    try:
        parser_class = get_component_by_name(parser_name)
        parser_instance = parser_class()
    except ValueError as e:
        logger.error(f"Failed to load parser '{parser_name}': {e}")
        raise

    # Call the parser's parse_document method
    try:
        parser_instance.process_document(user_id, doc_id)
        logger.info(
            f"Document {doc_id} ingested successfully using parser '{parser_name}'"
        )
    except Exception as e:
        logger.error(f"Failed to ingest document {doc_id}: {e}")
        raise


@celery_app.task()
@validate_arguments
def burn_doc_annotations(
    label_lookups: LabelLookupPythonType, doc_id: int, corpus_id: int
) -> tuple[str, str, OpenContractDocExport | None, Any, Any]:
    """
    Simple task wrapper for a fairly complex task to burn in the annotations for a given corpus on a given doc.
    This will alter the PDF and add highlight and labels.
    """
    return build_document_export(
        label_lookups=label_lookups, doc_id=doc_id, corpus_id=corpus_id
    )


@celery_app.task()
def convert_doc_to_funsd(
    user_id: int, doc_id: int, corpus_id: int
) -> tuple[int, dict[int, list[FunsdAnnotationType]], list[tuple[int, str, str]]]:
    def pawls_token_to_funsd_token(pawls_token: PawlsTokenPythonType) -> FunsdTokenType:
        pawls_xleft = pawls_token["x"]
        pawls_ybottom = pawls_token["y"]
        pawls_ytop = pawls_xleft + pawls_token["width"]
        pawls_xright = pawls_ybottom + pawls_token["height"]
        funsd_token = {
            "text": pawls_token["text"],
            # In FUNSD, this must be serialzied to list but that's done by json.dumps and tuple has better typing
            # control (fixed length, positional datatypes, etc.)
            "box": (pawls_xleft, pawls_ytop, pawls_xright, pawls_ybottom),
        }
        return funsd_token

    doc = Document.objects.get(id=doc_id)

    annotation_map: dict[int, list[dict]] = {}

    token_annotations = Annotation.objects.filter(
        annotation_label__label_type=TOKEN_LABEL,
        document_id=doc_id,
        corpus_id=corpus_id,
    ).order_by("page")

    file_object = default_storage.open(doc.pawls_parse_file.name)
    pawls_tokens = json.loads(file_object.read().decode("utf-8"))

    pdf_object = default_storage.open(doc.pdf_file.name)
    pdf_bytes = pdf_object.read()
    pdf_images = split_pdf_into_images(
        pdf_bytes, storage_path=f"user_{user_id}/pdf_page_images"
    )
    pdf_images_and_data = list(
        zip(
            [doc_id for _ in range(len(pdf_images))],
            pdf_images,
            ["PNG" for _ in range(len(pdf_images))],
        )
    )
    logger.info(f"convert_doc_to_funsd() - pdf_images: {pdf_images}")

    # TODO - investigate multi-select of annotations on same page. Code below (and, it seems, entire
    # application) assume no more than one annotation per page per Annotation obj.
    for annotation in token_annotations:

        base_id = f"{annotation.id}"

        """

        FUNSD format description from paper:

        Each form is encoded in a JSON file. We represent a form
        as a list of semantic entities that are interlinked. A semantic
        entity represents a group of words that belong together from
        a semantic and spatial standpoint. Each semantic entity is de-
        scribed by a unique identifier, a label (i.e., question, answer,
        header or other), a bounding box, a list of links with other
        entities, and a list of words. Each word is represented by its
        textual content and its bounding box. All the bounding boxes
        are represented by their coordinates following the schema
        box = [xlef t, ytop, xright, ybottom]. The links are directed
        and formatted as [idf rom, idto], where id represents the
        semantic entity identifier. The dataset statistics are shown in
        Table I. Even with a limited number of annotated documents,
        we obtain a large number of word-level annotations (> 30k)

         {
            "box": [
                446,
                257,
                461,
                267
            ],
            "text": "cc:",
            "label": "question",
            "words": [
                {
                    "box": [
                        446,
                        257,
                        461,
                        267
                    ],
                    "text": "cc:"
                }
            ],
            "linking": [
                [
                    1,
                    20
                ]
            ],
            "id": 1
        },
        """

        annot_json = annotation.json
        label = annotation.annotation_label

        for page in annot_json.keys():

            page_annot_json = annot_json[page]
            page_token_refs = page_annot_json["tokensJsons"]

            expanded_tokens = []
            for token_ref in page_token_refs:
                page_index = token_ref["pageIndex"]
                token_index = token_ref["tokenIndex"]
                token = pawls_tokens[page_index]["tokens"][token_index]

                # Convert token from PAWLS to FUNSD format (simple but annoying transforming done via function
                # defined above)
                expanded_tokens.append(pawls_token_to_funsd_token(token))

            # TODO - build FUNSD annotation here
            funsd_annotation: FunsdAnnotationType = {
                "id": f"{base_id}-{page}",
                "linking": [],  # TODO - pull in any relationships for label. This could be pretty complex (actually no)
                "text": page_annot_json["rawText"],
                "box": pawls_bbox_to_funsd_box(page_annot_json["bounds"]),
                "label": f"{label.text}",
                "words": expanded_tokens,
            }

            if page in annotation_map:
                annotation_map[page].append(funsd_annotation)
            else:
                annotation_map[page] = [funsd_annotation]

    return doc_id, annotation_map, pdf_images_and_data


@celery_app.task()
def extract_thumbnail(doc_id: int) -> None:
    """
    Extracts a thumbnail for a document using the appropriate thumbnail function based on the document's file type.
    Saves the returned thumbnail File instance to the document's icon field.

    Args:
        doc_id (int): The ID of the document.
    """
    import logging

    from django.conf import settings
    from django.core.exceptions import ObjectDoesNotExist

    from opencontractserver.documents.models import Document

    logger = logging.getLogger(__name__)
    logger.info(f"Extracting thumbnail for doc {doc_id}")

    # Fetch the document
    try:
        document = Document.objects.get(pk=doc_id)
    except ObjectDoesNotExist:
        logger.error(f"Document with id {doc_id} does not exist.")
        return

    file_type = document.file_type

    # Get the thumbnail function path from settings
    thumbnail_function_path = settings.THUMBNAIL_TASKS.get(file_type)

    if not thumbnail_function_path:
        logger.error(f"No thumbnail function defined for file type '{file_type}'.")
        return

    logger.info(
        f"Using thumbnail function '{thumbnail_function_path}' for doc {doc_id}"
    )

    # Dynamically import the thumbnail function
    thumbnail_function = import_function_from_string(thumbnail_function_path)

    # Determine the correct file field based on file_type
    if file_type == "application/pdf" and document.pdf_file:
        file_field = document.pdf_file
    elif file_type == "application/txt" and document.txt_extract_file:
        file_field = document.txt_extract_file
    else:
        logger.error(
            f"No valid file found for document {doc_id} with file type '{file_type}'."
        )
        return

    # Read the file bytes
    try:
        with file_field.open("rb") as f:
            file_bytes = f.read()
    except Exception as e:
        logger.error(f"Failed to read file for doc {doc_id}: {e}")
        return

    # Call the thumbnail function
    try:
        thumbnail_file: File | None = thumbnail_function(file_bytes)
        if thumbnail_file:
            # Save the thumbnail to the document's icon field
            document.icon.save(f"{doc_id}_icon.png", thumbnail_file)
            logger.info(f"Thumbnail extracted and saved successfully for doc {doc_id}")
        else:
            logger.error(f"Thumbnail function returned None for doc {doc_id}")
    except Exception as e:
        logger.error(f"Failed to extract thumbnail for doc {doc_id}: {e}")
