from __future__ import annotations

import enum
import json
import logging
import os
from typing import Any

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from pydantic import validate_arguments

from config import celery_app
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    LabelLookupPythonType,
    OpenContractDocAnnotationExport,
)
from opencontractserver.utils.etl import build_document_export
from opencontractserver.utils.pdf import base_64_encode_bytes

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
def base_64_encode_document(doc_id: int) -> tuple[str | None, str | None]:
    """
    Given a doc_id, encode the underlying pdf file in linked to the database
    to base64 string for use in celery pipelines. Built to output tuple, with
    position 0 being the doc name and pos 1 being the base64 string.

    """

    logger.info(f"base_64_encode_document - starting for doc pk {doc_id}")

    try:

        doc = Document.objects.get(pk=doc_id)
        doc_path = doc.pdf_file.name
        doc_name = os.path.basename(doc_path)
        doc_file = default_storage.open(doc_path, mode="rb")
        doc_base_64_string = base_64_encode_bytes(doc_file.read())

        return doc_name, doc_base_64_string

    except Exception as e:

        logger.error(f"Error building annotated doc for {doc_id}: {e}")
        return None, None


@celery_app.task()
@validate_arguments
def burn_doc_annotations(
    label_lookups: LabelLookupPythonType, doc_id: int, corpus_id: int
) -> tuple[str, str, OpenContractDocAnnotationExport | None, Any, Any]:
    """
    Simple task wrapper for a fairly complex task to burn in the annotations for a given corpus on a given doc.
    This will alter the PDF and add highlight and labels.
    """
    return build_document_export(
        label_lookups=label_lookups, doc_id=doc_id, corpus_id=corpus_id
    )


@celery_app.task()
def parse_base64_pdf(*args, doc_id: str = "") -> tuple[str, str, list]:
    """
    Expect args[0] from *IMMEDIATELY PRECEDING* base_64_encode_document to be tuple:

        (doc_name, doc_base_64_string)

    """

    # logging.info(f"parse_base64_pdf - received: {args}")
    logging.info(f"parse_base64_pdf - doc_id: {doc_id}")

    try:
        import base64
        import tempfile

        from pawls.commands.preprocess import process_tesseract

        # Nice guide on how to use base64 encoding to send file via text and then reconstitute bytes object on return
        # https://stackabuse.com/encoding-and-decoding-base64-strings-in-python/
        base64_img_bytes = args[0][1].encode("utf-8")
        decoded_file_data = base64.decodebytes(base64_img_bytes)

        with tempfile.NamedTemporaryFile(suffix=".pdf", prefix=TEMP_DIR) as tf:
            print(tf.name)
            tf.write(decoded_file_data)
            annotations: list = process_tesseract(tf.name)

            print("Annotations", annotations)

        return TaskStates.COMPLETE, "", annotations

    except Exception as e:
        return (
            TaskStates.ERROR,
            f"Failed on doc {doc_id} due to error: {e}",
            [],
        )  # except Exception as e:


@celery_app.task()
def write_pawls_file(*args, doc_id: str = ""):
    logging.info(f"write_pawls_file() - received {args}")
    pawls_pages = args[0][2]
    pawls_string = json.dumps(pawls_pages)
    logging.info(f"Pawls string: {pawls_string}")
    pawls_file = ContentFile(pawls_string.encode("utf-8"))
    document = Document.objects.get(pk=doc_id)
    document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)
    document.backend_lock = False
    document.page_count = len(pawls_pages)
    document.save()
