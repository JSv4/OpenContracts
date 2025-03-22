from __future__ import annotations

import enum
import json
import logging
from typing import Any

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db.models import Q
from django.utils import timezone
from pydantic import validate_arguments

from config import celery_app
from opencontractserver.annotations.models import TOKEN_LABEL, Annotation
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.pipeline.utils import (
    get_component_by_name,
    get_components_by_mimetype,
)
from opencontractserver.types.dicts import (
    AnnotationLabelPythonType,
    FunsdAnnotationType,
    FunsdTokenType,
    LabelLookupPythonType,
    OpenContractDocExport,
    PawlsTokenPythonType,
)
from opencontractserver.types.enums import AnnotationFilterMode
from opencontractserver.utils.etl import build_document_export, pawls_bbox_to_funsd_box
from opencontractserver.utils.files import split_pdf_into_images

logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


# CONSTANT
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


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def ingest_doc(self, user_id: int, doc_id: int) -> None:
    """
    Ingests a document using the appropriate parser based on the document's MIME type.
    The parser class is determined using get_component_by_name.
    If there is a dict in settings named <parser_name>_kwargs, it is passed to the parser
    as keyword arguments.

    This Celery task will retry up to 3 times (with a 60-second wait between attempts)
    in case of transient errors or exceptions.

    Args:
        self: Celery task instance (passed automatically when bind=True).
        user_id (int): The ID of the user.
        doc_id (int): The ID of the document to ingest.

    Raises:
        ValueError: If no parser is defined for the document's MIME type.
        Exception: If parsing fails.
    """
    logger.info(f"[ingest_doc] Ingesting doc {doc_id} for user {user_id}")

    # Fetch the document
    try:
        document: Document = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        logger.error(f"Document with id {doc_id} does not exist.")
        return

    parser_name: str | None = getattr(settings, "PREFERRED_PARSERS", {}).get(
        document.file_type
    )
    if not parser_name:
        raise ValueError(f"No parser defined for MIME type '{document.file_type}'")

    # Attempt to load parser kwargs
    parser_kwargs = {}
    if hasattr(settings, "PARSER_KWARGS"):
        kwargs = getattr(settings, "PARSER_KWARGS", {})
        parser_kwargs = kwargs.get(parser_name, {})
        logger.debug(f"Resolved parser kwargs for '{parser_name}': {parser_kwargs}")

    # Get the parser class using get_component_by_name
    try:
        parser_class = get_component_by_name(parser_name)
        parser_instance = parser_class()
    except ValueError as e:
        logger.error(f"Failed to load parser '{parser_name}': {e}")
        raise

    # Call the parser's process_document method
    try:
        parser_instance.process_document(user_id, doc_id, **parser_kwargs)
        logger.info(
            f"[ingest_doc] Document {doc_id} ingested successfully with '{parser_name}'"
        )
    except Exception as e:
        logger.error(f"[ingest_doc] Failed to ingest document {doc_id}: {e}")
        # Raise again so Celery can trigger a retry
        raise


@celery_app.task()
@validate_arguments
def burn_doc_annotations(
    label_lookups: LabelLookupPythonType,
    doc_id: int,
    corpus_id: int,
    analysis_ids: list[int] | None = None,
    annotation_filter_mode: str = "CORPUS_LABELSET_ONLY",
) -> tuple[
    str | None,
    str | None,
    OpenContractDocExport | None,
    dict[str | int, AnnotationLabelPythonType],
    dict[str | int, AnnotationLabelPythonType],
]:
    """
    Inspects a single Document (doc_id) in corpus (corpus_id) and selects the relevant
    annotations based on the annotation_filter_mode:
      - "CORPUS_LABELSET_ONLY": only annotations that match labels from the corpus
        label set
      - "CORPUS_LABELSET_PLUS_ANALYSES": union of corpus label set + annotations from
        the given analyses
      - "ANALYSES_ONLY": ignore corpus label set and gather only annotations
        belonging to the listed analyses.

    Returns a tuple containing all data needed for packaging:
      (filename, base64-encoded file, doc_export_data, text_labels, doc_labels)
    """
    return build_document_export(
        label_lookups=label_lookups, doc_id=doc_id, corpus_id=corpus_id
    )


@celery_app.task()
def convert_doc_to_funsd(
    user_id: int,
    doc_id: int,
    corpus_id: int,
    analysis_ids: list[int] | None = None,
    annotation_filter_mode: str = AnnotationFilterMode.CORPUS_LABELSET_ONLY.value,
) -> tuple[int, dict[int | str, list[dict[str, Any]]], list[tuple[int, str, str]]]:
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

    # Modify the annotation query to respect filter mode
    doc_annotations = Annotation.objects.filter(document_id=doc_id, corpus_id=corpus_id)

    if annotation_filter_mode == AnnotationFilterMode.ANALYSES_ONLY.value:
        if analysis_ids:
            doc_annotations = doc_annotations.filter(analysis_id__in=analysis_ids)
        else:
            doc_annotations = Annotation.objects.none()
    elif (
        annotation_filter_mode
        == AnnotationFilterMode.CORPUS_LABELSET_PLUS_ANALYSES.value
    ):
        label_pks_in_corpus = (
            Annotation.objects.filter(corpus_id=corpus_id)
            .values_list("annotation_label_id", flat=True)
            .distinct()
        )
        if analysis_ids:
            doc_annotations = doc_annotations.filter(
                Q(annotation_label_id__in=label_pks_in_corpus)
                | Q(analysis_id__in=analysis_ids)
            )
        else:
            doc_annotations = doc_annotations.filter(
                annotation_label_id__in=label_pks_in_corpus
            )
    else:  # CORPUS_LABELSET_ONLY
        label_pks_in_corpus = (
            Annotation.objects.filter(corpus_id=corpus_id)
            .values_list("annotation_label_id", flat=True)
            .distinct()
        )
        doc_annotations = doc_annotations.filter(
            annotation_label_id__in=label_pks_in_corpus
        )

    token_annotations = doc_annotations.filter(
        annotation_label__label_type=TOKEN_LABEL,
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


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def extract_thumbnail(self, doc_id: int) -> None:
    """
    Extracts a thumbnail for a document using a thumbnail generator based on the document's file type.
    The generator is selected from the pipeline thumbnailers that support the document's MIME type.

    This Celery task will retry up to 3 times (with a 60-second wait between attempts)
    in case of transient errors or exceptions.

    Args:
        self: Celery task instance (passed automatically when bind=True).
        doc_id (int): The ID of the document to process.

    Returns:
        None
    """
    logger.info(f"[extract_thumbnail] Extracting thumbnail for doc {doc_id}")

    # Fetch the document
    try:
        document: Document = Document.objects.get(pk=doc_id)
    except Document.DoesNotExist:
        logger.error(f"Document with id {doc_id} does not exist.")
        return

    file_type: str = document.file_type

    # Get compatible thumbnailers for the document's MIME type
    components = get_components_by_mimetype(file_type)
    thumbnailers = components.get("thumbnailers", [])

    if not thumbnailers:
        logger.error(f"No thumbnailer found for file type '{file_type}'.")
        return

    # Use the first available thumbnailer
    thumbnailer_class = thumbnailers[0]
    logger.info(f"Using thumbnailer '{thumbnailer_class.__name__}' for doc {doc_id}")

    try:
        thumbnailer: BaseThumbnailGenerator = thumbnailer_class()
        thumbnail_file = thumbnailer.generate_thumbnail(doc_id)
        if thumbnail_file:
            logger.info(
                f"[extract_thumbnail] Thumbnail extracted and saved for doc {doc_id}"
            )
        else:
            logger.error(
                f"[extract_thumbnail] Thumbnail generation failed for doc {doc_id}"
            )
    except Exception as e:
        logger.error(
            f"[extract_thumbnail] Failed to extract thumbnail for doc {doc_id}: {e}"
        )
        # Raise for Celery to attempt retries
        raise
