import logging
from typing import Optional

from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.thumbnails.pdfs import pdf_thumbnail_from_bytes

logger = logging.getLogger(__name__)


class PdfThumbnailGenerator(BaseThumbnailGenerator):
    """
    A thumbnail generator that creates thumbnails from pdf files.
    """

    title = "PDF Thumbnail Generator"
    description = "Generates a thumbnail image from PDF content."
    author = "JSv4"
    dependencies = []
    supported_file_types = [FileTypeEnum.PDF]

    def _generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
        height: int = 300,
        width: int = 300,
    ) -> Optional[tuple[bytes, str]]:
        """
        Generate a thumbnail from bytes.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """

        try:
            # Determine desired dimensions (could be class attributes or hardcoded for now)
            thumbnail_size = (width, width)
            crop_size = (width, height)

            return pdf_thumbnail_from_bytes(
                pdf_bytes,
                thumbnail_size=thumbnail_size,
                crop_size=crop_size
            )

        except Exception as e:
            logger.error(f"Unable to create a thumbnail due to error: {e}")
            return None
