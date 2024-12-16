from typing import Optional, Tuple
from io import BytesIO

from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.utils.files import create_text_thumbnail
from opencontractserver.pipeline.base.file_types import FileTypeEnum


class PdfThumbnailGenerator(BaseThumbnailGenerator):
    """
    A thumbnail generator that creates thumbnails from pdf files.
    """

    title = "PDF Thumbnail Generator"
    description = "Generates a thumbnail image from PDF content."
    author = "JSv4"
    dependencies = []
    supported_file_types = [FileTypeEnum.PDF]

    def __generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
    ) -> Optional[Tuple[bytes, str]]:
        """
        Generate a thumbnail from bytes.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """
        import io
        import logging

        import cv2
        import numpy as np
        from pdf2image import convert_from_bytes
        from PIL import Image

        logger = logging.getLogger(__name__)
        logger.setLevel(logging.DEBUG)

        def add_margin(
            pil_img: Image.Image, top: int, right: int, bottom: int, left: int, color: tuple
        ) -> Image.Image:
            """Adds margin to the PIL Image."""
            width, height = pil_img.size
            new_width = width + right + left
            new_height = height + top + bottom
            result = Image.new(pil_img.mode, (new_width, new_height), color)
            result.paste(pil_img, (left, top))
            return result

        def expand2square(pil_img: Image.Image, background_color: tuple) -> Image.Image:
            """Expands the PIL Image to a square with the given background color."""
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
            # Convert PDF bytes to image of the first page
            page_one_image = convert_from_bytes(
                pdf_bytes, dpi=100, first_page=1, last_page=1, fmt="jpeg", size=(600, None)
            )[0]

            # Convert PIL Image to OpenCV format
            opencv_image = cv2.cvtColor(np.array(page_one_image), cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)

            # Invert image (white text on black background)
            inverted_gray = 255 * (gray < 128).astype(np.uint8)

            # Noise filtering
            kernel = np.ones((2, 2), np.uint8)
            morphed = cv2.morphologyEx(inverted_gray, cv2.MORPH_OPEN, kernel)

            # Find contours and bounding box
            coords = cv2.findNonZero(morphed)
            x, y, w, h = cv2.boundingRect(coords)

            # Crop the image to the bounding box
            page_one_image_cropped = page_one_image.crop((x, y, x + w, y + h))

            # Add margin to the image
            width, height = page_one_image_cropped.size
            page_one_image_cropped_padded = add_margin(
                page_one_image_cropped,
                int(height * 0.05 / 2),
                int(width * 0.05 / 2),
                int(height * 0.05 / 2),
                int(width * 0.05 / 2),
                (255, 255, 255),
            )

            # Expand image to a square
            page_one_image_square = expand2square(
                page_one_image_cropped_padded, (255, 255, 255)
            )

            # Resize and crop to 400x200 pixels
            page_one_image_square.thumbnail((400, 400))
            page_one_image_final = page_one_image_square.crop((0, 0, 400, 200))

            # Save the image to a BytesIO stream
            image_io = io.BytesIO()
            page_one_image_final.save(image_io, format="JPEG")
            image_io.seek(0)

            # Create and return a Django File instance
            return image_io.getvalue(), "jpg"

        except Exception as e:
            logger.error(f"Unable to create a thumbnail due to error: {e}")
            return None