from __future__ import annotations

import base64
import enum
import io
import json
import logging
import os
import pathlib
import uuid
from typing import Any

from celery import chord, group
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File
from django.core.files.storage import default_storage
from pydantic import validate_arguments

from config import celery_app
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    LabelLookupPythonType,
    OpenContractDocAnnotationExport, PawlsPagePythonType,
)
from opencontractserver.utils.etl import build_document_export
from opencontractserver.utils.pdf import base_64_encode_bytes, extract_pawls_from_pdfs_bytes

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
def process_pdf_page(
    total_page_count: int,
    page_num: int,
    page_path: str,
    user_id: int
) -> tuple[int, str, str]:

    logger.info(f"process_pdf_page() - Process page {page_num} of {total_page_count} from path {page_path}")

    if settings.USE_AWS:
        import boto3

        logger.info("process_pdf_page() - Load obj from s3")
        s3 = boto3.client('s3')

        page_obj = s3.get_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=page_path
        )
        page_data = page_obj['Body'].read()
    else:
        with open(page_path, 'rb') as page_file:
            page_data = page_file.read()

    logger.info(f"Page data: {page_data}")
    annotations = extract_pawls_from_pdfs_bytes(
        pdf_bytes=page_data
    )

    logger.info(f"process_pdf_page() - processing complete with annotations of type {type(annotations)} and len "
               f"{len(annotations)}")

    logger.info("process_pdf_page() - write to temporary storage to avoid overloading Redis")

    if settings.USE_AWS:
        pawls_fragment_path = f"user_{user_id}/pawls_fragments/{uuid.uuid4()}.json"
        s3.put_object(
            Key=pawls_fragment_path,
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Body=json.dumps(annotations[0])
        )
    else:
        pawls_fragment_folder_path = pathlib.Path(f"/tmp/user_{user_id}/pawls_fragments")
        pawls_fragment_folder_path.mkdir(parents=True, exist_ok=True)
        pawls_fragment_path = pawls_fragment_folder_path / f"{uuid.uuid4()}.json"
        with pawls_fragment_path.open('w') as f:
            f.write(json.dumps(annotations[0]))
        pawls_fragment_path = pawls_fragment_path.resolve().__str__()

    logger.info(f"process_pdf_page() - annotations written to {pawls_fragment_path}")

    return page_num, pawls_fragment_path, page_path


@celery_app.task()
def reassemble_extracted_pdf_parts(
    doc_parts: list[list[int, str, str]],
    doc_id: int,
):

    logger.info(f"reassemble_extracted_pdf_parts() - received parts: {doc_parts}")

    sorted_doc_parts = sorted(doc_parts)
    pawls_layer: list[PawlsPagePythonType] = []

    for doc_part in sorted_doc_parts:

        page_num, pawls_page_path, pdf_page_path = doc_part

        if settings.USE_AWS:
            import boto3

            logger.info("process_pdf_page() - Load obj from s3")
            s3 = boto3.client('s3')

            page_obj = s3.get_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=pawls_page_path
            )
            page_pawls_layer = json.loads(page_obj['Body'].read().decode("utf-8"))

        else:
            with open(pawls_page_path, "r") as f:
                page_pawls_layer = json.loads(f.read())

        pawls_layer.append(page_pawls_layer)

    pawls_string = json.dumps(pawls_layer)
    pawls_file = ContentFile(pawls_string.encode("utf-8"))
    document = Document.objects.get(pk=doc_id)
    document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)
    document.page_count = len(sorted_doc_parts)
    document.save()

@celery_app.task()
def set_doc_lock_state(
    *args,
    locked: bool,
    doc_id: int
):
    document = Document.objects.get(pk=doc_id)
    document.backend_lock = locked
    document.save()


@celery_app.task()
# @validate_arguments
def split_pdf_for_processing(
    user_id: int,
    doc_id: int
) -> list[tuple[int, str]]:


    logger.info(f"split_pdf_for_processing() - split doc {doc_id} for user {user_id}")

    from PyPDF2 import PdfReader, PdfWriter

    doc = Document.objects.get(pk=doc_id)
    doc_path = doc.pdf_file.name
    doc_file = default_storage.open(doc_path, mode="rb")

    if settings.USE_AWS:
        import boto3
        s3 = boto3.client('s3')

    pdf = PdfReader(doc_file)

    #TODO - for each page, store to disk as a temporary file OR
    # store to cloud storage and pass the path to the storage
    # location rather than the bytes themselves (to cut down on
    # Redis usage)

    pages_and_paths: list[tuple[int, str]] = []
    processing_tasks = []
    total_page_count = len(pdf.pages)

    for page in range(total_page_count):

        page_bytes_stream = io.BytesIO()

        logger.info(f"split_pdf_for_processing() - process page {page}")
        pdf_writer = PdfWriter()
        pdf_writer.add_page(pdf.pages[page])
        pdf_writer.write(page_bytes_stream)

        if settings.USE_AWS:
            page_path = f"user_{user_id}/fragments/{uuid.uuid4()}.pdf"
            s3.put_object(
                Key=page_path,
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Body=page_bytes_stream.getvalue()
            )
        else:
            pdf_fragment_folder_path = pathlib.Path(f"/tmp/user_{user_id}/pdf_fragments")
            pdf_fragment_folder_path.mkdir(parents=True, exist_ok=True)
            pdf_fragment_path = pdf_fragment_folder_path / f"{uuid.uuid4()}.pdf"
            with pdf_fragment_path.open('wb') as f:
                f.write(page_bytes_stream.getvalue())

            page_path = pdf_fragment_path.resolve().__str__()

        pages_and_paths.append((page, page_path))
        processing_tasks.append(
            process_pdf_page.si(
                total_page_count=total_page_count,
                page_num=page,
                page_path=page_path,
                user_id=user_id
            )
        )

    logger.info(f"plit_pdf_for_processing() - launch processing workflow")
    process_workflow = chord(
        group(
            processing_tasks
        ),
        reassemble_extracted_pdf_parts.s(
            doc_id=doc_id
        ),
    )
    process_workflow.apply_async()
    logger.info(f"plit_pdf_for_processing() - pdf for doc_id {doc_id} being processed async")

    logger.info(f"split_pdf_for_processing() - pages_and_paths: {pages_and_paths}")
    return pages_and_paths


@celery_app.task()
@validate_arguments
def burn_doc_annotations(
    label_lookups: LabelLookupPythonType,
    doc_id: int,
    corpus_id: int
) -> tuple[str, str, OpenContractDocAnnotationExport | None, Any, Any]:
    """
    Simple task wrapper for a fairly complex task to burn in the annotations for a given corpus on a given doc.
    This will alter the PDF and add highlight and labels.
    """
    return build_document_export(
        label_lookups=label_lookups, doc_id=doc_id, corpus_id=corpus_id
    )


@celery_app.task()
def extract_thumbnail(*args, doc_id=-1, **kwargs):

    logger.info(f"Extract thumbnail for doc #{doc_id}")

    # Based on this: https://note.nkmk.me/en/python-pillow-add-margin-expand-canvas/
    def add_margin(pil_img, top, right, bottom, left, color):
        width, height = pil_img.size
        new_width = width + right + left
        new_height = height + top + bottom
        result = Image.new(pil_img.mode, (new_width, new_height), color)
        result.paste(pil_img, (left, top))
        return result

    # Based on this: https://note.nkmk.me/en/python-pillow-add-margin-expand-canvas/
    def expand2square(pil_img, background_color):
        width, height = pil_img.size
        if width == height:
            return pil_img
        elif width > height:
            result = Image.new(pil_img.mode, (width, width), background_color)
            result.paste(pil_img, (0, (width - height) // 2))
            return result
        else:
            result = Image.new(pil_img.mode, (height, height), background_color)
            result.paste(pil_img, ((height - width) // 2, 0))
            return result

    try:

        import cv2
        import numpy as np
        from django.core.files.storage import default_storage
        from pdf2image import convert_from_bytes
        from PIL import Image

        document = Document.objects.get(pk=doc_id)

        # logger.info("Doc opened")

        # Load the file object from Django storage backend
        file_object = default_storage.open(document.pdf_file.name, mode="rb")
        file_data = file_object.read()

        # Try to use Pdf2Image / Pillow to get a screenshot of the first page of the do
        # Use pdf2image to grab the image of the first page... we'll create a custom icon for the doc.
        page_one_image = convert_from_bytes(
            file_data, dpi=100, first_page=1, last_page=1, fmt="jpeg", size=(600, None)
        )[0]
        # logger.info(f"page_one_image: {page_one_image}")

        # Use OpenCV to find the bounding box
        # Based in part on answer from @rayryeng here:
        # https://stackoverflow.com/questions/49907382/how-to-remove-whitespace-from-an-image-in-opencv
        opencvImage = cv2.cvtColor(np.array(page_one_image), cv2.COLOR_BGR2GRAY)

        # logger.info(f"opencvImage created: {opencvImage}")
        gray = 255 * (opencvImage < 128).astype(np.uint8)  # To invert the text to white
        gray = cv2.morphologyEx(
            gray, cv2.MORPH_OPEN, np.ones((2, 2), dtype=np.uint8)
        )  # Perform noise filtering
        coords = cv2.findNonZero(gray)  # Find all non-zero points (text)
        x, y, w, h = cv2.boundingRect(coords)  # Find minimum spanning bounding box
        # logger.info(f"Bounding rect determined with x {x} y {y} w {w} and h {h}")

        # Crop to bounding box...
        page_one_image_cropped = page_one_image.crop((x, y, x + w, y + h))
        # logger.info("Cropped...")

        # Add 5% padding to image before resize...
        width, height = page_one_image_cropped.size
        page_one_image_cropped_padded = add_margin(
            page_one_image_cropped,
            int(height * 0.05 / 2),
            int(width * 0.05 / 2),
            int(height * 0.05 / 2),
            int(width * 0.05 / 2),
            (255, 255, 255),
        )
        # logger.info("Padding added to image")

        # Give the image a square aspect ratio
        page_one_image_cropped_square = expand2square(
            page_one_image_cropped_padded, (255, 255, 255)
        )
        # logger.info(f"Expanded to square: {page_one_image_cropped_square}")

        # Resize to 400 X 200 px
        page_one_image_cropped_square.thumbnail((400, 400))
        # logger.info(f"Resized to 400px: {page_one_image_cropped_square}")

        # Crop to 400 X 200 px
        page_one_image_cropped_square = page_one_image_cropped_square.crop(
            (0, 0, 400, 200)
        )

        b = io.BytesIO()
        page_one_image_cropped_square.save(b, "JPEG")

        pdf_snapshot_file = File(b)
        document.icon.save(f"./{doc_id}_icon.jpg", pdf_snapshot_file)
        # logger.info(f"Snapshot saved...")

    except Exception as e:
        logger.error(
            f"Unable to create a screenshot for doc_id {doc_id} due to error: {e}"
        )
