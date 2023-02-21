import base64
import logging

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
    TEMP_DIR: str = "./tmp"
) -> list[PawlsPagePythonType]:


    import tempfile

    from pawls.commands.preprocess import process_tesseract

    with tempfile.NamedTemporaryFile(suffix=".pdf", prefix=TEMP_DIR) as tf:
        print(tf.name)
        print(type(tf))
        tf.write(pdf_bytes)
        annotations: list = process_tesseract(tf.name)

    return annotations
