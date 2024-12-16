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

    def __generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
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
            return pdf_thumbnail_from_bytes(pdf_bytes)

        except Exception as e:
            logger.error(f"Unable to create a thumbnail due to error: {e}")
            return None
