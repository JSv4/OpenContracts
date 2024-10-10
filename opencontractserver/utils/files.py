import base64
import logging
import pathlib
import typing
import uuid
import string
from PIL import Image, ImageDraw, ImageFont
import textwrap
from io import BytesIO

from django.conf import settings
from PyPDF2 import PdfReader
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
    color_tuple = tuple(int(color[i: i + 2], 16) for i in (0, 2, 4))
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

        # Ensure target_format is uppercase
        target_format = target_format.upper()
        if target_format not in ["PNG", "JPEG"]:
            raise ValueError(f"Unsupported target format: {target_format}")

        # TODO - make sure target image resolution is compatible with PAWLS x,y coord system
        images = convert_from_bytes(pdf_bytes, size=(754, 1000))
        print(f"PDF images: {len(images)}")

        # Determine file extension and content type
        file_extension = ".png" if target_format == "PNG" else ".jpg"
        content_type = f"image/{target_format.lower()}"

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
                import boto3

                s3 = boto3.client("s3")
                page_path = f"{storage_path}/{uuid.uuid4()}{file_extension}"
                s3.put_object(
                    Key=page_path,
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    Body=img_bytes_stream.getvalue(),
                    ContentType=content_type,
                )
            else:
                pdf_fragment_folder_path = pathlib.Path(storage_path)
                pdf_fragment_folder_path.mkdir(parents=True, exist_ok=True)
                pdf_fragment_path = (
                    pdf_fragment_folder_path / f"{uuid.uuid4()}{file_extension}"
                )
                with pdf_fragment_path.open("wb") as f:
                    f.write(img_bytes_stream.getvalue())
                page_path = str(pdf_fragment_path.resolve())

            page_paths.append(page_path)

    except Exception as e:
        logger.error(f"split_pdf_into_images() - failed due to unexpected error: {e}")

    return page_paths


def check_if_pdf_needs_ocr(file_object, threshold=10):
    pdf_reader = PdfReader(file_object)
    total_text = ""

    for page in pdf_reader.pages:
        total_text += page.extract_text()

    # Reset file pointer to the beginning for subsequent use
    file_object.seek(0)

    # If the total extracted text is less than the threshold, it likely needs OCR
    return len(total_text.strip()) < threshold


def is_plaintext(file_path, sample_size=1024, threshold=0.7):
    try:
        with open(file_path, 'rb') as file:
            # Read a sample of the file
            sample = file.read(sample_size)
            if len(sample) == 0:
                return False

            # Count printable characters
            printable_count = sum(1 for byte in sample if chr(byte) in string.printable)

            # Calculate the ratio of printable characters
            printable_ratio = printable_count / len(sample)

            # If the ratio is above the threshold, consider it plaintext
            return printable_ratio > threshold
    except IOError:
        print(f"Error: Unable to read file {file_path}")
        return False


def is_plaintext_content(content, sample_size=1024, threshold=0.7):
    sample = content[0:sample_size]

    # Count printable characters
    printable_count = sum(1 for byte in sample if chr(byte) in string.printable)

    # Calculate the ratio of printable characters
    printable_ratio = printable_count / len(sample)

    # If the ratio is above the threshold, consider it plaintext
    return printable_ratio > threshold


def create_text_thumbnail(text, width=300, height=400, font_size=12, margin=20, line_spacing=4):
    # Create a new white image
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)

    # Load a font
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except IOError:
        font = ImageFont.load_default()

    # Calculate the maximum width of text
    max_width = width - 2 * margin

    # Wrap the text
    lines = textwrap.wrap(text, width=max_width // (font_size // 2))

    # Draw the text
    y_text = margin
    for line in lines:
        draw.text((margin, y_text), line, font=font, fill='black')
        y_text += font_size + line_spacing

        # Stop if we've reached the bottom of the image
        if y_text > height - margin:
            break

    # Add some lines to simulate ruled paper
    for i in range(margin, height - margin, font_size + line_spacing):
        draw.line([(margin, i), (width - margin, i)], fill='lightblue', width=1)

    return img
