import logging
import os
from pathlib import Path
import pytesseract
from typing import Optional, List, Dict, Any

from django.conf import settings
from django.core.files.storage import default_storage
from docling_core.transforms.chunker.hierarchical_chunker import (
    HierarchicalChunker,
)
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import DoclingDocument, NodeItem

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import OpenContractDocExport, OpenContractsAnnotationPythonType

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
        artifacts_path = settings.DOCLING_MODELS_PATH

        if not os.path.exists(artifacts_path):
            raise FileNotFoundError(f"Docling models path '{artifacts_path}' does not exist.")

        # Log the contents of the models directory
        logger.info(f"Docling models directory contents: {os.listdir(artifacts_path)}")

        pipeline_options = PdfPipelineOptions(
            artifacts_path=artifacts_path,
            do_ocr=True,
            do_table_structure=True,
            generate_page_images = True
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
            
            logger.info(f"Result: {dir(result)}")

            doc: DoclingDocument = result.document

            # Log the basic properties of the DoclingDocument
            logger.info(f"DoclingDocument version: {doc.version}")
            logger.info(f"Number of pages: {len(doc.pages)}")
            logger.info(f"Number of texts: {len(doc.texts)}")
            logger.info(f"Number of tables: {len(doc.tables)}")
            logger.info(f"Number of pictures: {len(doc.pictures)}")
            logger.info(f"Number of groups: {len(doc.groups)}")
            logger.info(f"Metadata: {doc.key_value_items}")

            # Unpack and log detailed structures
            for i, page in doc.pages.items():
                logger.info(f"Page {i}: size=({page.size.width}, {page.size.height}, {page.image.pil_image})")
                
                # print(pytesseract.image_to_boxes(page.image.pil_image))
                word_data = pytesseract.image_to_data(page.image.pil_image, output_type=pytesseract.Output.DICT)
    
                # Create a list to store word boxes
                word_boxes = []
                
                # Process each word
                n_boxes = len(word_data['text'])
                for i in range(n_boxes):
                    # Skip empty text
                    if int(word_data['conf'][i]) > 0:
                        word_info = {
                            'text': word_data['text'][i],
                            'confidence': word_data['conf'][i],
                            'box': {
                                'x': word_data['left'][i],
                                'y': word_data['top'][i],
                                'width': word_data['width'][i],
                                'height': word_data['height'][i]
                            },
                            'block_num': word_data['block_num'][i],
                            'line_num': word_data['line_num'][i],
                            'word_num': word_data['word_num'][i]
                        }
                        word_boxes.append(word_info)
            
                logger.info(f"Word boxes: {word_boxes}")
                
            """
            a 208 607 211 611 0
            i 211 607 215 611 0
            v 215 607 216 611 0
            e 218 607 222 611 0
            r 222 607 227 611 0
            """

            for i, text_item in enumerate(doc.texts):
                logger.info(
                    f"Text[{i}]: text={text_item.text[:50]}, children={text_item.children}, "
                    f"label={text_item.label}, model_config={text_item.model_config}, "
                    f"orig={text_item.orig}, parent={text_item.parent}, "
                    f"prov={text_item.prov}, self_ref={text_item.self_ref}"
                )

            for i, table_item in enumerate(doc.tables):
                logger.info(f"Table[{i}]: rows={len(table_item.rows)}")

            for i, picture_item in enumerate(doc.pictures):
                logger.info(f"Picture[{i}]: bbox={picture_item.bbox}")

            # Log groups and their properties
            for i, group in enumerate(doc.groups):
                logger.info(
                    f"Group[{i}]: children={group.children}, label={group.label}, "
                    f"model_config={group.model_config}, name={group.name}, "
                    f"parent={group.parent}, self_ref={group.self_ref}"
                )

            # Log furniture (headers/footers)
            if doc.furniture:
                logger.info("Document has furniture (headers/footers).")
                logger.info(
                    f"Furniture: children={doc.furniture.children}, label={doc.furniture.label}, "
                    f"model_config={doc.furniture.model_config}, name={doc.furniture.name}, "
                    f"parent={doc.furniture.parent}, self_ref={doc.furniture.self_ref}"
                )
            else:
                logger.info("No furniture in document.")

            # Log body hierarchy
            if doc.body:
                logger.info("Logging document body hierarchy.")
                logger.info(
                    f"Body: children={doc.body.children}, label={doc.body.label}, "
                    f"model_config={doc.body.model_config}, name={doc.body.name}, "
                    f"parent={doc.body.parent}, self_ref={doc.body.self_ref}"
                )
            else:
                logger.info("No body in document.")

            annotations = self.convert_chunks_to_annotations(doc)
            logger.info(f"Annotations: {annotations}")

            # Extract plain text content without formatting
            content = doc.export_to_markdown(strict_text=True)
            with open("content.txt", "w") as f:
                f.write(content)

            # Log the extracted content length
            logger.info(f"Extracted content length: {len(content)} characters")

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

            # Log the final OpenContracts data structure
            logger.info(f"OpenContracts data: {open_contracts_data}")

            # Return parsed data
            return open_contracts_data

        except Exception as e:
            logger.error(f"Docling parser failed: {e}")
            return None

        finally:
            # Clean up the temporary file
            if os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)

    def _extract_title(self, doc: DoclingDocument, filename: str) -> str:
        """
        Extract document title using a fallback hierarchy:
        1. Document metadata
        2. First heading in content
        3. Original filename

        Args:
            doc (DoclingDocument): Docling document object.
            filename (str): Original PDF filename without extension.

        Returns:
            str: Document title string.
        """
        logger.info("Extracting document title")

        # Try to find first heading
        for text in doc.texts:
            if text.type == "heading":
                logger.info(f"Title found in first heading: {text.text}")
                return text.text

        logger.info(f"Using filename as title: {filename}")
        return filename

    def _generate_pawls_content(self, doc) -> List[Dict[str, Any]]:
        """
        Convert Docling document content to PAWLS format.
        Preserves text positions, page sizes, and document structure.

        Args:
            doc (DoclingDocument): Docling document object.

        Returns:
            List[Dict[str, Any]]: List of PAWLS page objects with tokens and page information.
        """
        logger.info("Generating PAWLS content")

        # Map page numbers to their tokens
        pages: Dict[int, List[Dict[str, Any]]] = {}

        # Extract text items with position information
        for i, text in enumerate(doc.texts):
            if not hasattr(text, "bbox") or not text.bbox:
                logger.info(f"Text[{i}] has no bounding box, skipping")
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
            logger.info(f"Added token on page {page_num}: {token}")

        # Build PAWLS page objects with size information
        pawls_pages = []
        for page_num in sorted(pages.keys()):
            # Get actual page dimensions from Docling if available
            if page_num in doc.pages:
                page_size = doc.pages[page_num].size
                logger.info(
                    f"Page {page_num} dimensions: width={page_size.width}, height={page_size.height}"
                )
            else:
                page_size = None
                logger.warning(f"Page size not found for page {page_num}, using defaults")

            page_content = {
                "page": {
                    "width": page_size.width if page_size else 612.0,
                    "height": page_size.height if page_size else 792.0,
                    "index": page_num,
                },
                "tokens": pages[page_num],
            }
            pawls_pages.append(page_content)
            logger.info(f"PAWLS content for page {page_num} added")

        return pawls_pages

    def convert_chunks_to_annotations(
        self, docling_document: DoclingDocument
    ) -> list[OpenContractsAnnotationPythonType]:
        """
        Converts a DoclingDocument into OpenContractDocExport format.

        Args:
            docling_document: The DoclingDocument instance.
            document_title (str): The title of the document.

        Returns:
            OpenContractDocExport: The converted document data.
        """
        
        chunker = HierarchicalChunker()
        chunk_iter = chunker.chunk(dl_doc=docling_document)
        chunks = list(chunk_iter)

        for chunk in chunks:
            logger.info(f"Chunk: {chunk}")

        # Collect content and annotations from DoclingDocument
        content_parts: list[str] = []
        for chunk in chunks:

            # Build annotation
            annotation: OpenContractsAnnotationPythonType = {
                "id": None,
                "annotationLabel": chunk.label.name if chunk.label else "UNKNOWN",
                "rawText": chunk.text,
                "page": chunk.meta.prov[0].page_no if chunk.meta and chunk.meta.prov else 1,
                "annotation_json": {},  # Build this based on actual requirements
                "parent_id": None,  # Set parent_id if hierarchical structure exists
                "annotation_type": None,
                "structural": True,  # Assuming chunks represent structural elements
            }
            open_contract_data["labelled_text"].append(annotation)

        # Join collected content
        open_contract_data["content"] = "\n".join(content_parts)

        return open_contract_data
