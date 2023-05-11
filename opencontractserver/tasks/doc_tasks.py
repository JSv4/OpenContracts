from __future__ import annotations

import enum
import io
import json
import logging
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
from opencontractserver.annotations.models import (
    METADATA_LABEL,
    TOKEN_LABEL,
    Annotation,
)
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    FunsdAnnotationLoaderMapType,
    FunsdAnnotationType,
    FunsdTokenType,
    LabelLookupPythonType,
    OpenContractDocExport,
    PawlsPagePythonType,
    PawlsTokenPythonType,
)
from opencontractserver.utils.etl import build_document_export
from opencontractserver.utils.pdf import (
    extract_pawls_from_pdfs_bytes,
    split_pdf_into_images,
)
from opencontractserver.utils.text import __consolidate_common_equivalent_chars

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


# CONSTANTS
class TaskStates(str, enum.Enum):
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"
    WARNING = "WARNING"


TEMP_DIR = "./tmp"


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def process_pdf_page(
    total_page_count: int, page_num: int, page_path: str, user_id: int
) -> tuple[int, str, str]:

    logger.info(
        f"process_pdf_page() - Process page {page_num} of {total_page_count} from path {page_path}"
    )

    if settings.USE_AWS:
        import boto3

        logger.info("process_pdf_page() - Load obj from s3")
        s3 = boto3.client("s3")

        page_obj = s3.get_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=page_path)
        page_data = page_obj["Body"].read()
    else:
        with open(page_path, "rb") as page_file:
            page_data = page_file.read()

    # logger.info(f"Page data: {page_data}")
    annotations = extract_pawls_from_pdfs_bytes(pdf_bytes=page_data)

    logger.info(
        f"process_pdf_page() - processing complete with annotations of type {type(annotations)} and len "
        f"{len(annotations)}"
    )

    logger.info(
        "process_pdf_page() - write to temporary storage to avoid overloading Redis"
    )

    if settings.USE_AWS:
        pawls_fragment_path = f"user_{user_id}/pawls_fragments/{uuid.uuid4()}.json"
        s3.put_object(
            Key=pawls_fragment_path,
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Body=json.dumps(annotations[0]),
        )
    else:
        pawls_fragment_folder_path = pathlib.Path(
            f"/tmp/user_{user_id}/pawls_fragments"
        )
        pawls_fragment_folder_path.mkdir(parents=True, exist_ok=True)
        pawls_fragment_path = pawls_fragment_folder_path / f"{uuid.uuid4()}.json"
        with pawls_fragment_path.open("w") as f:
            f.write(json.dumps(annotations[0]))
        pawls_fragment_path = pawls_fragment_path.resolve().__str__()

    logger.info(f"process_pdf_page() - annotations written to {pawls_fragment_path}")

    return page_num, pawls_fragment_path, page_path


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def reassemble_extracted_pdf_parts(
    doc_parts: list[list[int, str, str]],
    doc_id: int,
):

    logger.info(f"reassemble_extracted_pdf_parts() - received parts: {doc_parts}")

    sorted_doc_parts = sorted(doc_parts)
    pawls_layer: list[PawlsPagePythonType] = []

    doc_text = ""
    line_start_char = 0
    last_token_height = -1

    for doc_part in sorted_doc_parts:

        page_num, pawls_page_path, pdf_page_path = doc_part

        if settings.USE_AWS:
            import boto3

            logger.info("process_pdf_page() - Load obj from s3")
            s3 = boto3.client("s3")

            page_obj = s3.get_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=pawls_page_path
            )
            page_pawls_layer = json.loads(page_obj["Body"].read().decode("utf-8"))

        else:
            with open(pawls_page_path) as f:
                page_pawls_layer = json.loads(f.read())

        # Process PAWLS tokens to create a text layer
        # We DO want to reset y pos on every page, which will be set to y of first token.
        last_y = -1
        line_text = ""
        lines: list[tuple[int, int, int, int]] = []

        for page_token_index, token in enumerate(page_pawls_layer["tokens"]):

            token_text = __consolidate_common_equivalent_chars(token["text"])

            new_y = round(token["y"], 0)
            new_token_height = round(token["height"], 0)

            if last_y == -1:
                last_y = round(token["y"], 0)

            if last_token_height == -1:
                # Not really sure how to handle situations where the token height is 0 at the beginning... just
                # try 1 pixel, I guess?
                last_token_height = new_token_height if new_token_height > 0 else 1

            # Tesseract line positions seem a bit erratic, honestly. Figuring out when a token is on the same line is
            # not as easy as checking if y positions are the same as they are often off by a couple pixels. This is
            # dependent on document, font size, OCR quality, and more... Decent heuristic I came up with was to look
            # at two consecutive tokens, take the max token height and then see if the y difference was more than some
            # percentage of the larger of the two token heights (to account for things like periods or dashes or
            # whatever next to a word). Seems to work pretty well, though I am *SURE* it will fail in some cases. Easy
            # enough fix there... just don't give a cr@p about line height and newlines and always use a space. That's
            # actually probably fine for ML purposes.
            # logger.info(f"Token: {token['text']} (len {len(token['text'])})")
            # logger.info(f"Line y difference: {abs(new_y - last_y)}")
            # logger.info(f"Compared to averaged token height: {0.5 * max(new_token_height, last_token_height)}")

            if abs(new_y - last_y) > (0.5 * max(new_token_height, last_token_height)):

                lines.append(
                    (
                        page_num,
                        len(lines),
                        line_start_char,
                        len(line_text) + line_start_char,
                    )
                )

                line_start_char = len(doc_text) + 1  # Accounting for newline
                line_text = token_text

            else:
                line_text += " " if len(line_text) > 0 else ""
                line_text += token_text

            doc_text += " " if len(doc_text) > 0 else ""
            doc_text += token_text

        pawls_layer.append(page_pawls_layer)

    pawls_string = json.dumps(pawls_layer)
    pawls_file = ContentFile(pawls_string.encode("utf-8"))
    txt_file = ContentFile(doc_text.encode("utf-8"))

    document = Document.objects.get(pk=doc_id)
    document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)
    document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)
    document.page_count = len(sorted_doc_parts)
    document.save()


@celery_app.task()
def set_doc_lock_state(*args, locked: bool, doc_id: int):
    document = Document.objects.get(pk=doc_id)
    document.backend_lock = locked
    document.save()


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def split_pdf_for_processing(user_id: int, doc_id: int) -> list[tuple[int, str]]:

    logger.info(f"split_pdf_for_processing() - split doc {doc_id} for user {user_id}")

    from PyPDF2 import PdfReader, PdfWriter

    doc = Document.objects.get(pk=doc_id)
    doc_path = doc.pdf_file.name
    doc_file = default_storage.open(doc_path, mode="rb")

    if settings.USE_AWS:
        import boto3

        s3 = boto3.client("s3")

    pdf = PdfReader(doc_file)

    # TODO - for each page, store to disk as a temporary file OR
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
                Body=page_bytes_stream.getvalue(),
            )
        else:
            pdf_fragment_folder_path = pathlib.Path(
                f"/tmp/user_{user_id}/pdf_fragments"
            )
            pdf_fragment_folder_path.mkdir(parents=True, exist_ok=True)
            pdf_fragment_path = pdf_fragment_folder_path / f"{uuid.uuid4()}.pdf"
            with pdf_fragment_path.open("wb") as f:
                f.write(page_bytes_stream.getvalue())

            page_path = pdf_fragment_path.resolve().__str__()

        pages_and_paths.append((page, page_path))
        processing_tasks.append(
            process_pdf_page.si(
                total_page_count=total_page_count,
                page_num=page,
                page_path=page_path,
                user_id=user_id,
            )
        )

    logger.info("plit_pdf_for_processing() - launch processing workflow")
    process_workflow = chord(
        group(processing_tasks),
        reassemble_extracted_pdf_parts.s(doc_id=doc_id),
    )
    process_workflow.apply_async()
    logger.info(
        f"plit_pdf_for_processing() - pdf for doc_id {doc_id} being processed async"
    )

    logger.info(f"split_pdf_for_processing() - pages_and_paths: {pages_and_paths}")
    return pages_and_paths  # Leaving this here for tests for now... not a thorough way of evaluating underlying task
    # completion


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
@validate_arguments
def convert_doc_to_langchain_task(doc_id: int, corpus_id: int) -> tuple[str, dict]:
    """
    Given a doc and corpus, export text and all metadata in a tuple that can then be combined and exported for langchain
    """
    doc = Document.objects.get(id=doc_id)

    metadata_annotations = Annotation.objects.filter(
        document_id=doc_id,
        corpus_id=corpus_id,
        annotation_label__label_type=METADATA_LABEL,
    )

    if doc.txt_extract_file.name:
        with doc.txt_extract_file.open("r") as txt_file:
            text = txt_file.read()
    else:
        text = ""

    metadata_json = {"doc_id": doc_id, "corpus_id": corpus_id}

    for metadata in metadata_annotations:
        metadata_json[metadata.annotation_label.text] = metadata.raw_text

    return text, metadata_json


@celery_app.task()
def convert_doc_to_funsd(
    user_id: int, doc_id: int, corpus_id: int
) -> tuple[int, dict[int, list[FunsdAnnotationType]], list[tuple[int, str, str]]]:
    def pawls_bbox_to_funsd_box(
        pawls_bbox: BoundingBoxPythonType,
    ) -> tuple[float, float, float, float]:
        return (
            pawls_bbox["left"],
            pawls_bbox["top"],
            pawls_bbox["right"],
            pawls_bbox["bottom"],
        )

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
def convert_doc_to_funsd_loader_input(
    user_id: int, doc_id: int, corpus_id: int
) -> tuple[int, FunsdAnnotationLoaderMapType, list[tuple[int, str, str]]]:
    def pawls_bbox_to_funsd_box(
        pawls_bbox: BoundingBoxPythonType,
    ) -> tuple[float, float, float, float]:
        return (
            pawls_bbox["left"],
            pawls_bbox["top"],
            pawls_bbox["right"],
            pawls_bbox["bottom"],
        )

    def pawls_token_to_funsd_token(pawls_token: PawlsTokenPythonType) -> FunsdTokenType:
        pawls_xleft = pawls_token["x"]
        pawls_ybottom = pawls_token["y"]
        pawls_ytop = pawls_xleft + pawls_token["width"]
        pawls_xright = pawls_ybottom + pawls_token["height"]
        funsd_token = {
            "text": pawls_token["text"],
            "box": (pawls_xleft, pawls_ytop, pawls_xright, pawls_ybottom),
        }
        return funsd_token

    def label_to_ner_tag(label: str) -> str:
        mapping = {
            "header": "HEADER",
            "question": "QUESTION",
            "answer": "ANSWER",
        }
        for key, value in mapping.items():
            if key in label.lower():
                return value
        return "O"

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

    for annotation in token_annotations:

        base_id = f"{annotation.id}"
        annot_json = annotation.json
        label = annotation.annotation_label

        for page in annot_json.keys():

            page_annot_json = annot_json[page]
            page_token_refs = page_annot_json["tokensJsons"]

            expanded_tokens = []
            expanded_bboxes = []
            ner_tags = []

            for token_ref in page_token_refs:
                page_index = token_ref["pageIndex"]
                token_index = token_ref["tokenIndex"]
                token = pawls_tokens[page_index]["tokens"][token_index]

                # Convert token from PAWLS to FUNSD format
                expanded_tokens.append(token["text"])
                expanded_bboxes.append(pawls_bbox_to_funsd_box(token))
                ner_tags.append(f"B-{label_to_ner_tag(label.text)}")

            funsd_annotation = {
                "id": f"{base_id}-{page}",
                "tokens": expanded_tokens,
                "bboxes": expanded_bboxes,
                "ner_tags": ner_tags,
                "image": pdf_images_and_data[int(page) - 1],
            }

            if page in annotation_map:
                annotation_map[page].append(funsd_annotation)
            else:
                annotation_map[page] = [funsd_annotation]

    return doc_id, annotation_map, pdf_images_and_data


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
