import logging
from typing import Optional
from django.core.files.base import File
from opencontractserver.utils.files import (
    create_text_thumbnail,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def text_thumbnail_from_bytes(text_bytes: bytes) -> Optional[File]:
    """
    Create a thumbnail image from text bytes.

    Args:
        text_bytes (bytes): The text content in bytes.

    Returns:
        Optional[File]: A Django File instance containing the thumbnail image, or None if an error occurs.
    """
    import io
    import logging
    from PIL import Image

    logger = logging.getLogger(__name__)
    logger.setLevel(logging.DEBUG)

    try:
        # Decode the text bytes to a string
        text = text_bytes.decode('utf-8')

        logger.debug(f"Text content length: {len(text)}")

        # Create the thumbnail image
        img = create_text_thumbnail(text)

        if img is None or not isinstance(img, Image.Image):
            logger.error("create_text_thumbnail returned invalid image.")
            return None

        logger.debug(f"Thumbnail image size: {img.size}")

        # Save the image to a BytesIO stream
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="PNG")
        img_byte_arr.seek(0)

        # Create and return a Django File instance
        thumbnail_file = File(img_byte_arr, name="thumbnail.png")
        return thumbnail_file

    except Exception as e:
        logger.exception(f"Error creating text thumbnail: {str(e)}")
        return None
