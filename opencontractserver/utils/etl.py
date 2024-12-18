import base64
import io
import json
import logging
import os
import traceback
import uuid
from typing import Any

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from pydantic import TypeAdapter, ValidationError, create_model
from typing_extensions import TypedDict

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    LabelLookupPythonType,
    OpenContractDocExport,
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

        text_labels[f"{tl.pk}"] = {
            "id": f"{tl.pk}",
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

        doc_labels[f"{dl.pk}"] = {
            "id": f"{dl.pk}",
            "color": hex_color,
            "description": dl.description,
            "icon": dl.icon,
            "text": dl.text,
            "label_type": "DOC_TYPE_LABEL",
        }

    return {"text_labels": text_labels, "doc_labels": doc_labels}


def build_document_export(
    label_lookups: LabelLookupPythonType, doc_id: int, corpus_id: int
) -> tuple[str, str, OpenContractDocExport | None, Any, Any]:
    """
    Fairly complex function to burn in the annotations for a given corpus on a given doc. This will alter the PDF
    and add highlight and labels. It's still a bit ugly, but it works.

    """

    logger.info(f"burn_doc_annotations - label_lookups: {label_lookups}")

    from PyPDF2 import PdfReader, PdfWriter

    from opencontractserver.utils.files import (
        add_highlight_to_new_page,
        createHighlight,
    )

    try:

        text_labels = label_lookups["text_labels"]
        doc_labels = label_lookups["doc_labels"]

        doc = Document.objects.get(pk=doc_id)
        doc_name: str = os.path.basename(doc.pdf_file.name)

        corpus = Corpus.objects.get(pk=corpus_id)

        extracted_document_content_json = ""
        try:
            with default_storage.open(doc.txt_extract_file.name) as content_file:
                extracted_document_content_json = content_file.read().decode("utf-8")
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

        # PDF Code:
        try:
            pdf_input = PdfReader(doc.pdf_file.open(mode="rb"))
        except Exception as e:
            logger.error(f"Could not load input pdf due to error: {e}")
            return "", "", None, {}, {}

        # logger.info("Original pdf loaded")

        pdf_output = PdfWriter()
        # logger.info("New PDFFileWriter created")

        page_highlights = {}

        doc_annotation_json: OpenContractDocExport = {
            "doc_labels": [],
            "labelled_text": [],
            "title": doc.title,
            "description": doc.description,
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

        for annot in doc_annotations:
            if annot.annotation_label.label_type == "DOC_TYPE_LABEL":
                labels_for_doc.append(f"{annot.annotation_label.text}")

            if annot.annotation_label.label_type in ["TOKEN_LABEL", "SPAN_LABEL"]:
                labelled_text.append(
                    {
                        "id": f"{annot.id}",
                        "annotationLabel": f"{annot.annotation_label.id}",
                        "rawText": annot.raw_text,
                        "page": annot.page,
                        "annotation_json": annot.json,
                        "parent_id": annot.parent.id if annot.parent else None,
                        "annotation_type": annot.annotation_type,
                        "structural": annot.structural,
                    }
                )

                annotation_json: dict[
                    str, OpenContractsSinglePageAnnotationType
                ] = annot.json

                for targ_page_num in annotation_json:
                    highlight = annotation_json[targ_page_num]

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

        total_page_count = len(pdf_input.pages)

        for i in range(0, total_page_count):
            page = pdf_input.pages[i]
            page_box = page.mediabox

            page_height = page_box.upper_left[1]
            page_width = page_box.lower_right[0]

            if f"{i + 1}" in page_highlights:
                data_height = page_sizes[i]["height"]
                data_width = page_sizes[i]["width"]

                y_scale = float(page_height) / float(data_height)
                x_scale = float(page_width) / float(data_width)

                for label_id in page_highlights[f"{i + 1}"]:
                    label = text_labels[f"{label_id}"]

                    for rect in page_highlights[f"{i + 1}"][label_id]:
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

                        add_highlight_to_new_page(highlight, page, pdf_output)

            pdf_output.add_page(page)

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
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return "", "", None, {}, {}


def is_dict_instance_of_typed_dict(instance: dict, typed_dict: type[TypedDict]):
    # validate with pydantic
    try:
        TypeAdapter(typed_dict).validate_python(instance)
        return True

    except ValidationError:
        return False


def pawls_bbox_to_funsd_box(
    pawls_bbox: BoundingBoxPythonType,
) -> tuple[float, float, float, float]:
    return (
        pawls_bbox["left"],
        pawls_bbox["top"],
        pawls_bbox["right"],
        pawls_bbox["bottom"],
    )


def parse_model_or_primitive(value: str) -> type:
    """
    Parse a string value as either a Pydantic model or a primitive type.

    This function attempts to parse the given string value as a Pydantic model using the
    `parse_raw_as` function from the `pydantic` module. If the parsing succeeds, it means
    the value represents a valid Pydantic model, and the function returns the parsed model.

    If parsing as a Pydantic model fails with a `ValidationError`, the function then checks
    if the value is one of the supported primitive type names ("int", "float", "str", "bool").
    If it is, the function uses `eval` to evaluate the primitive type name and returns the
    corresponding type object.

    If the value is neither a valid model nor a supported primitive type name, the function
    raises a `ValueError` indicating an invalid model or primitive type.

    Args:
        value (str): The string value to parse as either a Pydantic model or a primitive type.

    Returns:
        The parsed Pydantic model if the value represents a valid model, or the corresponding
        primitive type object if the value is a supported primitive type name.

    Raises:
        ValueError: If the value is neither a valid Pydantic model nor a supported primitive
                    type name.

    Example:        model_string = '''
        class User(BaseModel):
            name: str
            age: int
            email: str
        '''
        model = parse_model_or_primitive(model_string)
        print(type(model))  # Output: <class 'pydantic.main.BaseModel'>

        primitive_type_string = "int"
        primitive_type = parse_model_or_primitive(primitive_type_string)
        print(primitive_type)  # Output: <class 'int'>
    """
    if value == "int":
        return int
    elif value == "float":
        return float
    elif value == "str":
        return str
    elif value == "bool":
        return bool
    elif ":" in value:
        try:
            props = {}
            lines = value.split("\n")
            for index, line in enumerate(lines):

                line = line.strip()
                if line == "":
                    continue

                if "=" in line:
                    raise ValueError("We don't support default values, sorry.")
                elif ":" not in line:
                    raise ValueError("Every property needs to be typed!")
                parts = line.split(":")
                if len(parts) != 2:
                    raise ValueError(f"There is an error in line {index+1} your model")
                props[parts[0].strip()] = (parts[1].strip(), ...)

            model = create_model(uuid.uuid4().__str__(), **props)
            return model
        except Exception as e:
            raise ValueError(f"Failed to parse model from value due to error: {e}")

    else:
        raise ValueError(f"Invalid model or primitive type: {value}")
