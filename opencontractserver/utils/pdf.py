import base64
import logging
import pathlib
import typing
import uuid
from io import BytesIO

from django.conf import settings
from PyPDF2.generic import (
    ArrayObject,
    DictionaryObject,
    FloatObject,
    NameObject,
    NumberObject,
    TextStringObject,
)

from opencontractserver.types.dicts import PawlsPagePythonType

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def base_64_encode_bytes(doc_bytes: bytes):
    """
    Given bytes, encode base64 and utf-8
    """
    base64_encoded_data = base64.b64encode(doc_bytes)
    base64_encoded_message = base64_encoded_data.decode("utf-8")
    return base64_encoded_message


def convert_hex_to_rgb_tuple(color: str) -> tuple[int, ...]:
    color_tuple = tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))
    return color_tuple


# Courtesy of SO: https://gist.github.com/agentcooper/4c55133f5d95866acdee5017cd318558
# x1, y1 starts in bottom left corner
def createHighlight(
    x1: int, y1: int, x2: int, y2: int, meta: dict, color: tuple[float, float, float]
) -> DictionaryObject:

    logger.info("createHighlight() - Starting...")
    logger.info(f"meta: {meta}")
    logger.info(f"color: {color}")

    new_highlight = DictionaryObject()

    new_highlight.update(
        {
            NameObject("/F"): NumberObject(4),
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Highlight"),
            NameObject("/T"): TextStringObject(meta["author"]),
            NameObject("/Contents"): TextStringObject(meta["contents"]),
            NameObject("/C"): ArrayObject([FloatObject(c) for c in color]),
            NameObject("/Rect"): ArrayObject(
                [FloatObject(x1), FloatObject(y1), FloatObject(x2), FloatObject(y2)]
            ),
            NameObject("/QuadPoints"): ArrayObject(
                [
                    FloatObject(x1),
                    FloatObject(y2),
                    FloatObject(x2),
                    FloatObject(y2),
                    FloatObject(x1),
                    FloatObject(y1),
                    FloatObject(x2),
                    FloatObject(y1),
                ]
            ),
        }
    )

    return new_highlight


def add_highlight_to_new_page(highlight: DictionaryObject, page, output):
    # TODO - finish typing
    highlight_ref = output._addObject(highlight)

    if "/Annots" in page:
        page[NameObject("/Annots")].append(highlight_ref)
    else:
        page[NameObject("/Annots")] = ArrayObject([highlight_ref])


def add_highlight_to_page(highlight: DictionaryObject, page):
    # TODO - finish typing
    highlight_ref = page._addObject(highlight)

    if "/Annots" in page:
        page[NameObject("/Annots")].append(highlight_ref)
    else:
        page[NameObject("/Annots")] = ArrayObject([highlight_ref])


def extract_pawls_from_pdfs_bytes(
    pdf_bytes: bytes,
) -> list[PawlsPagePythonType]:

    from pdfpreprocessor.preprocessors.tesseract import process_tesseract

    pdf_fragment_folder_path = pathlib.Path("/tmp/user_0/pdf_fragments")
    pdf_fragment_folder_path.mkdir(parents=True, exist_ok=True)
    pdf_fragment_path = pdf_fragment_folder_path / f"{uuid.uuid4()}.pdf"
    with pdf_fragment_path.open("wb") as f:
        f.write(pdf_bytes)

    page_path = pdf_fragment_path.resolve().__str__()
    annotations: list = process_tesseract(page_path)

    pdf_fragment_path.unlink()

    return annotations


def split_pdf_into_images(
    pdf_bytes: bytes,
    storage_path: str,
    target_format: typing.Literal["PNG", "JPEG"] = "PNG",
) -> list[str]:
    """
    Given pytes of a pdf file, split into image of specified format, store them in appropriate temporary
    file storage location and then return list filepaths to the images, in page order.

    Storage path should be like this user_{user_id}/fragments for s3 or f"/tmp/user_{user_id}/pdf_fragments" for
    local storage

    """

    from pdf2image import convert_from_bytes

    page_paths = []

    try:
        # TODO - make sure target image resolution is compatible with PAWLS x,y coord system
        images = convert_from_bytes(pdf_bytes, size=(754, 1000))

        if settings.USE_AWS:
            import boto3

            s3 = boto3.client("s3")

        for img in images:

            # images is a list of a Pillow Image objs.
            # See here for ways to save (attempting to save bytes to memory):
            # https://github.com/python-pillow/Pillow/blob/cdf5fd439cbe381e6c796acc3ab3150242d8e861/src/PIL/Image.py#L497

            img_bytes_stream = BytesIO()
            img.save(img_bytes_stream, target_format)

            if settings.USE_AWS:
                page_path = f"{storage_path}/{uuid.uuid4()}.pdf"
                s3.put_object(
                    Key=page_path,
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    Body=img_bytes_stream.getvalue(),
                )
            else:
                pdf_fragment_folder_path = pathlib.Path(storage_path)
                pdf_fragment_folder_path.mkdir(parents=True, exist_ok=True)
                pdf_fragment_path = pdf_fragment_folder_path / f"{uuid.uuid4()}.pdf"
                with pdf_fragment_path.open("wb") as f:
                    f.write(img_bytes_stream.getvalue())

                page_path = pdf_fragment_path.resolve().__str__()

            page_paths.append(page_path)

    except Exception as e:
        logger.error(f"split_pdf_into_images() - failed due to unexpected error: {e}")

    return page_paths
