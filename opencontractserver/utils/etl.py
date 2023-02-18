import base64
import io
import json
import logging
import os
from typing import Any, cast

import pydantic
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from typing_extensions import TypedDict

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    LabelLookupPythonType,
    OpenContractDocAnnotationExport,
    OpenContractsSinglePageAnnotationType,
    PawlsPagePythonType,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


def build_label_lookups(corpus_id: str) -> LabelLookupPythonType:

    logger.info(f"build_label_lookups for corpus id #{corpus_id}")

    doc_labels = {}
    text_labels = {}

    corpus = Corpus.objects.get(pk=corpus_id)
    label_set = corpus.label_set

    text_label_queryset = label_set.annotation_labels.filter(label_type="TOKEN_LABEL")
    doc_type_labels_queryset = label_set.annotation_labels.filter(
        label_type="DOC_TYPE_LABEL"
    )

    for tl in text_label_queryset:

        # logger.info(f"Text label: {tl}")

        hex_color = "#9ACD32"
        if hasattr(tl, "color"):
            hex_color = tl.color

        # color = tuple(int(hex_color.lstrip('#')[i:i + 2], 16) / 256 for i in (0, 2, 4))

        text_labels[tl.pk] = {
            "id": tl.id,
            "color": hex_color,
            "description": tl.description,
            "icon": tl.icon,
            "text": tl.text,
            "label_type": "TOKEN_LABEL",
        }

    for dl in doc_type_labels_queryset:

        # logger.info(f"Doc label: {dl}")

        hex_color = "#9ACD32"
        if hasattr(dl, "color"):
            hex_color = dl.color

        doc_labels[dl.pk] = {
            "id": dl.id,
            "color": hex_color,
            "description": dl.description,
            "icon": dl.icon,
            "text": dl.text,
            "label_type": "DOC_TYPE_LABEL",
        }

    return {"text_labels": text_labels, "doc_labels": doc_labels}


def build_document_export(
    label_lookups: LabelLookupPythonType, doc_id: int, corpus_id: int
) -> tuple[str, str, OpenContractDocAnnotationExport | None, Any, Any]:

    """
    Fairly complex function to burn in the annotations for a given corpus on a given doc. This will alter the PDF
    and add highlight and labels. It's still a bit ugly, but it works.

    """

    logger.info(f"burn_doc_annotations - label_lookups: {label_lookups}")

    from PyPDF2 import PdfFileReader, PdfFileWriter

    from opencontractserver.utils.pdf import addHighlightToNewPage, createHighlight

    try:

        text_labels = label_lookups["text_labels"]
        # logger.info(f"Text labels: {text_labels}")

        doc_labels = label_lookups["doc_labels"]
        # logger.info(f"Doc labels: {doc_labels}")

        doc = Document.objects.get(pk=doc_id)
        doc_name: str = os.path.basename(doc.pdf_file.name)
        # logger.info(f"Loaded doc: {doc}")

        corpus = Corpus.objects.get(pk=corpus_id)
        # logger.info(f"Loaded corpus: {corpus}")

        extracted_document_content_json = {}
        try:
            with default_storage.open(doc.txt_extract_file.name) as content_file:
                extracted_document_content_json = json.loads(
                    content_file.read().decode("utf-8")
                )
        except Exception as e:
            logger.warning(f"Could not export doc text for doc {doc_id}: {e}")

        try:
            with default_storage.open(doc.pawls_parse_file.name) as pawls_file:
                pawls_tokens: list[PawlsPagePythonType] = json.loads(
                    pawls_file.read().decode("utf-8")
                )
        except Exception as e:
            logger.warning(f"Could not export pawls tokens for doc {doc_id}: {e}")

        annotated_pdf_bytes = io.BytesIO()
        doc_annotations = Annotation.objects.filter(document=doc, corpus=corpus)
        # logger.info(f"Loaded {len(doc_annotations)} annotations")

        # PDF Code:
        try:
            pdf_input = PdfFileReader(doc.pdf_file.open(mode="rb"))
            # logger.info("Loaded pdf")
        except Exception as e:
            logger.error(f"Could not load input pdf due to error: {e}")
            return "", "", None, {}, {}

        # logger.info("Original pdf loaded")

        pdf_output = PdfFileWriter()
        # logger.info("New PDFFileWriter created")

        page_highlights = {}

        doc_annotation_json: OpenContractDocAnnotationExport = {
            "doc_labels": [],
            "labelled_text": [],
            "title": doc.title,
            "content": extracted_document_content_json,
            "pawls_file_content": pawls_tokens,
            "page_count": doc.page_count,
        }

        page_sizes = {
            pawls_page["page"]["index"]: pawls_page["page"]
            for pawls_page in pawls_tokens
        }

        labelled_text = []
        labels_for_doc = []

        # logger.info("Annotation json created")

        for annot in doc_annotations:

            # logger.info(f"Annotation: {annot}")

            if annot.annotation_label.label_type == "DOC_TYPE_LABEL":
                # logger.info(f"Handle DOC_TYPE: {annot.annotation_label.text}")

                labels_for_doc.append(f"{annot.annotation_label.text}")

            if annot.annotation_label.label_type == "TOKEN_LABEL":

                # logger.info(f"Handle TOKEN_LABEL: {annot.annotation_label.id}")

                labelled_text.append(
                    {
                        "id": f"{annot.id}",
                        "annotationLabel": f"{annot.annotation_label.id}",
                        "rawText": annot.raw_text,
                        "page": annot.page,
                        "annotation_json": annot.json,
                    }
                )

                # Unpack the annotations and store them by page number because we have to reconstruct
                # the pdf page-by-page thanks to pypdf2 (doesn't seem easy to arbitrarily edit a loaded page)
                # TODO - highlight pawls tokens themselves instead of entire bounding box.
                annotation_json: dict[
                    str, OpenContractsSinglePageAnnotationType
                ] = annot.json

                # logger.info(f"Annotation json: {annotation_json}")

                for targ_page_num in annotation_json:

                    # logger.info(f"\tAnnotation on page {targ_page_num}")

                    highlight = annotation_json[targ_page_num]
                    # logger.info(f"\tProcess highlight: {highlight}")
                    # logger.info(f"These are from page: {targ_page_num}")

                    if targ_page_num in page_highlights:
                        if annot.annotation_label.id in page_highlights[targ_page_num]:
                            page_highlights[targ_page_num][
                                annot.annotation_label.id
                            ].append(highlight["bounds"])
                        else:
                            page_highlights[targ_page_num][
                                annot.annotation_label.id
                            ] = [highlight["bounds"]]
                    else:
                        page_highlights[targ_page_num] = {
                            annot.annotation_label.id: [highlight["bounds"]]
                        }

        doc_annotation_json["doc_labels"] = labels_for_doc
        doc_annotation_json["labelled_text"] = labelled_text

        # logger.info(f"Page highlights: {page_highlights}")
        # logger.info(f"Page dimensions: {page_sizes}")

        # Open each page, make any edits, and move to the output pdf (the best way I've found to do this in PyPDF so
        # far)
        # logger.info("Burn in annotations")
        for i in range(0, pdf_input.getNumPages()):

            # logger.info(f"Burn for page {i}")
            page = pdf_input.getPage(i)
            page_box = page.mediaBox

            page_height = page_box.upperLeft[1]
            # logger.info(f"PyPDF2 page_height: {page_height}")
            page_width = page_box.lowerRight[0]
            # logger.info(f"PyPDF2 page_width: {page_width}")

            if f"{i + 1}" in page_highlights:

                # logger.info(f"Page {i + 1} is in page_highlights")

                data_height = page_sizes[i]["height"]
                # logger.info(f"data_height: {data_height}")
                data_width = page_sizes[i]["width"]
                # logger.info(f"data_width: {data_width}")

                # logger.info(f"\n page_height type: {type(page_height)}")
                # logger.info(f"\n data_height type: {type(data_height)}")

                y_scale = float(page_height) / float(data_height)
                # logger.info(f"Y scale: {y_scale}")

                x_scale = float(page_width) / float(data_width)
                # logger.info(f"X scale: {x_scale}")

                for label_id in page_highlights[f"{i + 1}"]:

                    # logger.info(f"Look for label id {label_id} in {text_labels}")
                    label = text_labels[f"{label_id}"]
                    # logger.info(f"text_label for annotation is: {label}")

                    for rect in page_highlights[f"{i + 1}"][label_id]:
                        # logger.info(f"Handle rect: {rect}")
                        # logger.info("Color=")
                        # logger.info(f"{label['color']}")

                        highlight = createHighlight(
                            round(x_scale * rect["left"]),
                            round(float(page_height) - y_scale * rect["top"]),
                            round(x_scale * rect["right"]),
                            round(float(page_height) - y_scale * rect["bottom"]),
                            {"author": "Label:", "contents": label["text"]},
                            color=tuple(
                                int(label["color"].lstrip("#")[i : i + 2], 16) / 256
                                for i in (0, 2, 4)
                            ),
                        )

                        addHighlightToNewPage(highlight, page, pdf_output)

                        logger.info("Highlight added")

            pdf_output.addPage(page)

        # Serialize and write out the annotated pdf
        pdf_output.write(annotated_pdf_bytes)
        base64_encoded_data = base64.b64encode(annotated_pdf_bytes.getvalue())
        base64_encoded_message: str = base64_encoded_data.decode("utf-8")

        return (
            doc_name,
            base64_encoded_message,
            doc_annotation_json,
            text_labels,
            doc_labels,
        )

    except Exception as e:

        logger.error(f"Error building annotated doc for {doc_id}: {e}")
        return "", "", None, {}, {}


def is_dict_instance_of_typed_dict(instance: dict, typed_dict: type[TypedDict]):

    # validate with pydantic
    try:
        cast(
            typed_dict,
            pydantic.create_model_from_typeddict(typed_dict)(**instance).dict(),
        )
        return True

    except pydantic.ValidationError as exc:
        print(f"ERROR: Invalid schema: {exc}")
        return False
