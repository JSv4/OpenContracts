from __future__ import annotations

import enum
import io
import json
import logging
from typing import Any

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File
from django.core.files.storage import default_storage
from django.utils import timezone
from PIL import Image
from plasmapdf.models.PdfDataLayer import makePdfTranslationLayerFromPawlsTokens
from pydantic import validate_arguments

from config import celery_app
from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import (
    SPAN_LABEL,
    TOKEN_LABEL,
    Annotation,
    AnnotationLabel,
)
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    FunsdAnnotationType,
    FunsdTokenType,
    LabelLookupPythonType,
    OpenContractDocExport,
    PawlsTokenPythonType,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.etl import build_document_export, pawls_bbox_to_funsd_box
from opencontractserver.utils.files import (
    check_if_pdf_needs_ocr,
    create_text_thumbnail,
    split_pdf_into_images,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

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


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def ingest_txt(user_id: int, doc_id: int) -> list[tuple[int, str]]:
    import spacy

    logger.info(f"ingest_txt() - split doc {doc_id} for user {user_id}")

    label_obj = AnnotationLabel.objects.filter(
        text="SENTENCE",
        creator_id=user_id,
        label_type=SPAN_LABEL,
        read_only=True,
    )
    if label_obj.count() > 0:
        label_obj = label_obj[0]
    else:
        label_obj = AnnotationLabel(
            label_type=SPAN_LABEL,
            color="grey",
            description="Sentence",
            icon="expand",
            text="SENTENCE",
            creator_id=user_id,
            read_only=True,
        )
        label_obj.save()

    set_permissions_for_obj_to_user(user_id, label_obj, [PermissionTypes.ALL])

    doc = Document.objects.get(pk=doc_id)
    doc_path = doc.txt_extract_file.name
    txt_file = default_storage.open(doc_path, mode="r")

    nlp = spacy.load("en_core_web_lg")

    for sentence in nlp(txt_file.read()).sents:
        annot_obj = Annotation.objects.create(
            raw_text=sentence.text,
            page=1,
            json={"start": sentence.start_char, "end": sentence.end_char},
            annotation_label=label_obj,
            document=doc,
            creator_id=user_id,
            annotation_type=SPAN_LABEL,
            structural=True,  # Mark these explicitly as structural annotations.
        )
        annot_obj.save()
        set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def nlm_ingest_pdf(user_id: int, doc_id: int) -> list[tuple[int, str]]:
    # TODO - seeing persistent failure of Thomas Foster Appelant vs ... and Caster Hinckley et all. vs...
    #  need to investigate why parser keeps failing on these two.
    logger.info(f"nlm_ingest_pdf() - split doc {doc_id} for user {user_id}")

    doc = Document.objects.get(pk=doc_id)
    doc_path = doc.pdf_file.name
    doc_file = default_storage.open(doc_path, mode="rb")

    # Check if OCR is needed
    needs_ocr = check_if_pdf_needs_ocr(doc_file)
    logger.debug(f"Document {doc_id} needs OCR: {needs_ocr}")

    if settings.NLM_INGEST_API_KEY is not None:
        headers = {"API_KEY": settings.NLM_INGEST_API_KEY}
    else:
        headers = {}

    files = {"file": doc_file}
    params = {
        "calculate_opencontracts_data": "yes",
        "applyOcr": "yes" if needs_ocr and settings.NLM_INGEST_USE_OCR else "no",
    }  # Ensures calculate_opencontracts_data is set to True

    response = requests.post(
        settings.NLM_INGEST_HOSTNAME + "/api/parseDocument",
        headers=headers,
        files=files,
        params=params,
    )

    if not response.status_code == 200:
        response.raise_for_status()

    response_data = response.json()
    open_contracts_data: OpenContractDocExport | None = response_data.get(
        "return_dict", {}
    ).get("opencontracts_data", None)

    document = Document.objects.get(pk=doc_id)

    # Create new labels if needed
    if open_contracts_data is not None:

        # Get PAWLS layer and text contents
        pawls_string = json.dumps(open_contracts_data["pawls_file_content"])
        pawls_file = ContentFile(pawls_string.encode("utf-8"))

        # We want to use our own algorithm to create text layer from pawls tokens
        span_translation_layer = makePdfTranslationLayerFromPawlsTokens(
            json.loads(pawls_string.encode("utf-8"))
        )

        # We need to use the same translation algorithm from x,y tokens to spans EVERYWHERE... so when we first
        # parse the document,we want to use the same translation algorithm we'll later use when we try to map spans
        # BACK to the tokens.
        txt_file = ContentFile(span_translation_layer.doc_text.encode("utf-8"))

        document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)
        document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)
        document.page_count = len(open_contracts_data["pawls_file_content"])

        existing_text_labels: dict[str, AnnotationLabel] = {}

        # Now, annotate the document with any annotations that bubbled up from parser.
        for label_data in open_contracts_data["labelled_text"]:

            label_name = label_data["annotationLabel"]

            if label_name not in existing_text_labels:
                label_obj = AnnotationLabel.objects.filter(
                    text=label_name,
                    creator_id=user_id,
                    label_type=TOKEN_LABEL,
                    read_only=True,
                )
                if label_obj.count() > 0:
                    label_obj = label_obj[0]
                    existing_text_labels[label_name] = label_obj
                else:
                    label_serializer = AnnotationLabelSerializer(
                        data={
                            "label_type": "TOKEN_LABEL",
                            "color": "grey",
                            "description": "NLM Structural Label",
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
                document=doc,
                creator_id=user_id,
                annotation_type=TOKEN_LABEL,
                structural=True,  # Mark these explicitly as structural annotations.
            )
            annot_obj.save()
            set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

    document.save()


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
def extract_pdf_thumbnail(*args, doc_id=-1, **kwargs):

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


@celery_app.task()
def extract_txt_thumbnail(doc_id: int) -> None:
    """
    Create a thumbnail image from the text content of a document.

    Args:
        doc_id (int): The ID of the document to process.

    Raises:
        Exception: If there's an error during the thumbnail creation process.
    """
    try:
        document = Document.objects.get(pk=doc_id)

        # Read the text content
        with default_storage.open(document.txt_extract_file.name, "r") as file_object:
            text = file_object.read()

        logger.debug(f"Text content length: {len(text)}")

        # Create the thumbnail image
        img = create_text_thumbnail(text)

        if img is None or not isinstance(img, Image.Image):
            logger.error(
                f"create_text_thumbnail returned invalid image for doc_id {doc_id}"
            )
            return

        logger.debug(f"Thumbnail image size: {img.size}")

        # Save the image
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="PNG")
        img_byte_arr.seek(0)

        icon_file = ContentFile(img_byte_arr.getvalue())
        document.icon.save(f"{doc_id}_icon.png", icon_file)

        logger.info(f"Thumbnail created successfully for doc_id {doc_id}")

    except Exception as e:
        logger.exception(f"Error creating thumbnail for doc_id {doc_id}: {str(e)}")
