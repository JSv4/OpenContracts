from typing import Optional, Tuple
from io import BytesIO

from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.utils.files import create_text_thumbnail
from opencontractserver.pipeline.base.file_types import FileTypeEnum


class TextThumbnailGenerator(BaseThumbnailGenerator):
    """
    A thumbnail generator that creates thumbnails from text content.
    """

    title = "Text Thumbnail Generator"
    description = "Generates a thumbnail image from text content."
    author = "Your Name"
    dependencies = []
    supported_file_types = [FileTypeEnum.TXT]

    def __generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
    ) -> Optional[Tuple[bytes, str]]:
        """
        Generate a thumbnail from text content and pdf bytes.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """
        if txt_content:
            # Use the create_text_thumbnail function to generate an image from text
            image = create_text_thumbnail(text=txt_content)
            if image:
                # Save the image to bytes
                image_bytes_io = BytesIO()
                image.save(image_bytes_io, format='PNG')
                image_bytes = image_bytes_io.getvalue()
                return image_bytes, 'png'

        # Optionally, handle pdf_bytes if txt_content is not available
        if pdf_bytes:
            # Logic to generate thumbnail from PDF bytes (not implemented here)
            pass

        # If neither txt_content nor pdf_bytes could generate a thumbnail
        return None