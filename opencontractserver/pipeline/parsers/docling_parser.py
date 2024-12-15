import logging
import os
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.core.files.storage import default_storage
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import OpenContractDocExport

logger = logging.getLogger(__name__)


class DoclingParser(BaseParser):
    """
    Parser that uses Docling to convert PDF documents into OpenContracts format.
    """

    title = "Docling Parser"
    description = "Parses PDF documents using Docling."
    author = "Your Name"
    dependencies = ["docling"]
    supported_file_types = [FileTypeEnum.PDF]

    def __init__(self):
        """Initialize the Docling document converter."""
        pipeline_options = PdfPipelineOptions(
            artifacts_path=settings.DOCLING_MODELS_PATH,
            do_ocr=True,
            do_table_structure=True,
        )
        self.doc_converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

    def parse_document(
        self, user_id: int, doc_id: int
    ) -> Optional[OpenContractDocExport]:
        """
        Parses a document using Docling.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        logger.info(f"DoclingParser - Parsing doc {doc_id} for user {user_id}")

        # Retrieve the document
        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        # Create a temporary file path
        temp_dir = settings.TEMP_DIR if hasattr(settings, "TEMP_DIR") else "/tmp"
        temp_pdf_path = os.path.join(temp_dir, f"doc_{doc_id}.pdf")

        # Write the file to a temporary location
        with default_storage.open(doc_path, "rb") as pdf_file:
            with open(temp_pdf_path, "wb") as temp_pdf_file:
                temp_pdf_file.write(pdf_file.read())

        try:
            # Process document through Docling
            result = self.doc_converter.convert(temp_pdf_path)

            if result.status != ConversionStatus.SUCCESS:
                raise Exception(f"Conversion failed: {result.errors}")

            doc = result.document

            # Extract plain text content without formatting
            content = doc.export_to_markdown(strict_text=True)

            # Convert document structure to PAWLS format
            pawls_pages = self._generate_pawls_content(doc)

            # Create OpenContracts document structure
            open_contracts_data: OpenContractDocExport = {
                "title": self._extract_title(doc, Path(doc_path).stem),
                "content": content,
                "description": document.description or "",
                "pawls_file_content": pawls_pages,
                "page_count": len(pawls_pages),
                "doc_labels": [],
                "labelled_text": [],
            }

            # Return parsed data
            return open_contracts_data

        except Exception as e:
            logger.error(f"Docling parser failed: {e}")
            return None

        finally:
            # Clean up the temporary file
            if os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)

    def _extract_title(self, doc, filename: str) -> str:
        """
        Extract document title using a fallback hierarchy:
        1. Document metadata
        2. First heading in content
        3. Original filename

        Args:
            doc (Document): Docling document object.
            filename (str): Original PDF filename without extension.

        Returns:
            str: Document title string.
        """
        if doc.metadata and doc.metadata.title:
            return doc.metadata.title

        # Try to find first heading
        for text in doc.texts:
            if text.type == "heading":
                return text.text

        return filename

    def _generate_pawls_content(self, doc) -> list[dict]:
        """
        Convert Docling document content to PAWLS format.
        Preserves text positions, page sizes, and document structure.

        Args:
            doc (Document): Docling document object.

        Returns:
            list[dict]: List of PAWLS page objects with tokens and page information.
        """
        # Map page numbers to their tokens
        pages: dict[int, list[dict]] = {}

        # Extract text items with position information
        for text in doc.texts:
            if not hasattr(text, "bbox") or not text.bbox:
                continue

            page_num = getattr(text, "page", 0)
            if page_num not in pages:
                pages[page_num] = []

            # Convert Docling bbox to PAWLS token format
            token = {
                "x": float(text.bbox.x1),
                "y": float(text.bbox.y1),
                "width": float(text.bbox.x2 - text.bbox.x1),
                "height": float(text.bbox.y2 - text.bbox.y1),
                "text": text.text,
            }
            pages[page_num].append(token)

        # Build PAWLS page objects with size information
        pawls_pages = []
        for page_num in sorted(pages.keys()):
            # Get actual page dimensions from Docling if available
            page_size = doc.pages[page_num].size if page_num in doc.pages else None

            page_content = {
                "page": {
                    "width": page_size.width if page_size else 612.0,
                    "height": page_size.height if page_size else 792.0,
                    "index": page_num,
                },
                "tokens": pages[page_num],
            }
            pawls_pages.append(page_content)

        return pawls_pages
