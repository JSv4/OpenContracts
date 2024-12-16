from abc import ABC, abstractmethod
from typing import Optional, Tuple

from django.core.files.base import File

from opencontractserver.pipeline.base.file_types import FileTypeEnum


class BaseThumbnailGenerator(ABC):
    """
    Abstract base class for thumbnail generators. Thumbnail generators should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []

    def generate_thumbnail(self, doc_id: str | int) -> Optional[File]:
        """
        Generate a thumbnail for the given document ID by processing its text and PDF files.

        Args:
            doc_id (str | int): The ID of the document.

        Returns:
            Optional[File]: A Django File instance containing the thumbnail image, or None if an error occurs.
        """
        from django.core.files.base import ContentFile
        from opencontractserver.documents.models import Document

        try:
            # Load the Document instance
            document = Document.objects.get(id=doc_id)

            # Initialize variables
            txt_content: Optional[str] = None
            pdf_bytes: Optional[bytes] = None

            # Load the txt file content if available
            if document.txt_extract_file:
                with document.txt_extract_file.open('r') as txt_file:
                    txt_content = txt_file.read()

            # Load the pdf file bytes if available
            if document.pdf_file:
                with document.pdf_file.open('rb') as pdf_file:
                    pdf_bytes = pdf_file.read()

            # Pass both txt content and pdf bytes to the abstract method
            result = self.__generate_thumbnail(txt_content, pdf_bytes)
            if result:
                thumbnail_bytes, extension = result
                thumbnail_file = ContentFile(thumbnail_bytes)
                thumb_filename = f"thumbnail_{doc_id}.{extension}"
                # Save thumbnail to document's icon field
                document.icon.save(thumb_filename, thumbnail_file)
                document.save()
                return thumbnail_file

            # If no thumbnail generated
            return None

        except Document.DoesNotExist:
            print(f"Document with id {doc_id} does not exist.")
            return None

    @abstractmethod
    def __generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
    ) -> Optional[Tuple[bytes, str]]:
        """
        Abstract method to generate a thumbnail from txt content and pdf bytes.

        Args:
            txt_content (Optional[str]): The content of the text file.
            pdf_bytes (Optional[bytes]): The bytes of the PDF file.

        Returns:
            Optional[Tuple[bytes, str]]: A tuple containing the thumbnail image bytes and file extension,
                                         or None if an error occurs.
        """
        pass
