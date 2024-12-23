import io
import logging
import os
import json
from opencontractserver.utils.layout import reassign_annotation_hierarchy
import pdf2image
from pathlib import Path
import pytesseract
from shapely.geometry import box
from shapely.strtree import STRtree
from typing import Optional, List, Dict, Any, Tuple, Union
import numpy as np

from django.conf import settings
from django.core.files.storage import default_storage
from docling_core.transforms.chunker.hierarchical_chunker import (
    HierarchicalChunker,
)

from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import DoclingDocument, TextItem, SectionHeaderItem, DocItemLabel
from docling_core.types.doc.document import ListItem

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    OpenContractDocExport, 
    OpenContractsAnnotationPythonType,
    OpenContractsSinglePageAnnotationType,
    PawlsPagePythonType,
    PawlsTokenPythonType
)
from opencontractserver.utils.files import check_if_pdf_needs_ocr

logger = logging.getLogger(__name__)

# def print_labelled_text_hierarchy(
#     labelled_text: list[OpenContractsAnnotationPythonType], 
#     output_file_path: str
# ) -> None:
#     """
#     Traverse a list of OpenContractsAnnotationPythonType items (labelled_text), compute
#     and record an indent level for each entry, then write an indented, hierarchical 
#     view of their rawText fields to a specified file.

#     Indentation logic:
#       • Items with no parent_id are considered top-level and have indent_level = 0.
#       • Items with a valid parent_id have indent_level = parent_indent_level + 1.

#     The hierarchy is assumed to be acyclic. If an item references a parent_id that isn't
#     in the labelled_text's IDs, it will be ignored.

#     Args:
#         labelled_text (list[OpenContractsAnnotationPythonType]): The annotated text elements
#             to traverse.
#         output_file_path (str): The path of the file where the indented structure will 
#             be written.
#     """
#     # -------------------------------------------------------------------------
#     # STEP 1: Build a map of an item's "id" to the item object and adjacency lists.
#     # -------------------------------------------------------------------------
#     by_id = {}
#     children_map = {}

#     for item in labelled_text:
#         item_id = item.get("id")
#         if item_id is not None:
#             by_id[item_id] = item

#     # Prepare adjacency lists: parent_id -> list of child items
#     for item in labelled_text:
#         parent_id = item.get("parent_id")
#         child_id = item.get("id")
#         if child_id is None:
#             continue

#         if parent_id not in children_map:
#             children_map[parent_id] = []
#         children_map[parent_id].append(child_id)

#     # -------------------------------------------------------------------------
#     # STEP 2: Assign indent levels. We'll do this via a DFS from each top-level node.
#     # -------------------------------------------------------------------------
#     indent_levels = {}

#     def dfs_assign_indent(node_id: str | int, indent: int) -> None:
#         indent_levels[node_id] = indent
#         for cid in children_map.get(node_id, []):
#             dfs_assign_indent(cid, indent + 1)

#     # Find top-level items (those with no valid parent_id or parent_id=None)
#     top_level_nodes = [it.get("id") for it in labelled_text if it.get("parent_id") is None]
#     for root_id in top_level_nodes:
#         if root_id is not None:
#             dfs_assign_indent(root_id, 0)

#     # -------------------------------------------------------------------------
#     # STEP 3: Write the indented text to the output file.
#     #         We'll iterate through by_id in the order we just assigned indent levels.
#     #         If we want a strictly “reading” order, we might need a more structured 
#     #         approach, but for simplicity, we'll just group by top-level first, then 
#     #         sub-hierarchies.
#     # -------------------------------------------------------------------------
#     visited = set()

#     def dfs_write_indented(node_id: str | int, file_obj, indent: int) -> None:
#         visited.add(node_id)
#         item = by_id.get(node_id)
#         if not item:
#             return
#         # Craft the indented text
#         text_to_write = ("    " * indent) + f"- {item['rawText']}\n"
#         file_obj.write(text_to_write)

#         for cid in children_map.get(node_id, []):
#             if cid not in visited:
#                 dfs_write_indented(cid, file_obj, indent + 1)

#     with open(output_file_path, "w", encoding="utf-8") as f:
#         for root_id in top_level_nodes:
#             if root_id is not None and root_id not in visited:
#                 dfs_write_indented(root_id, f, 0)

def build_text_lookup(docling_document: DoclingDocument) -> Dict[str, str]:
    """
    Build a lookup (dictionary) from the text content of each item in
    docling_document.texts to its self_ref.
    
    Args:
        docling_document: The DoclingDocument that has .texts property
    
    Returns:
        A dictionary mapping stripped text content to the corresponding self_ref
    """
    text_lookup = {}
    for text_item in docling_document.texts:
        item_text = getattr(text_item, "text", None)
        item_ref = getattr(text_item, "self_ref", None)
        if isinstance(item_text, str) and item_text.strip() and isinstance(item_ref, str):
            text_lookup[item_text.strip()] = item_ref
    return text_lookup

def convert_docling_item_to_annotation(item: Union[TextItem, SectionHeaderItem, ListItem], spatial_indices_by_page: Dict[int, STRtree], tokens_by_page: Dict[int, List[PawlsTokenPythonType]], token_indices_by_page: Dict[int, np.ndarray]) -> Optional[OpenContractsAnnotationPythonType]:
    """Convert a document item to an annotation dictionary format.
    
    Creates a structured annotation dictionary containing bounding box information,
    text content, and metadata for the given document item.
    
    Args:
        item: A document item (TextItem, SectionHeaderItem, or ListItem)
        
    Returns:
        An AnnotationType dictionary containing the item's information, or None if
        the item lacks required provenance data
    """
    # Check for required attributes
    if not (hasattr(item, 'prov') and item.prov):
        return None
        
    first_prov = item.prov[0]
    if not first_prov.bbox:
        return None
        
    # Extract basic information
    bbox = first_prov.bbox
    page_no = first_prov.page_no
    item_text = getattr(item, 'text', '')
    
    chunk_bbox = box(bbox.l, bbox.t, bbox.r, bbox.b)
    spatial_index = spatial_indices_by_page.get(page_no)
    tokens = tokens_by_page.get(page_no)
    token_indices_array = token_indices_by_page.get(page_no)

    if spatial_index is None or tokens is None or token_indices_array is None:
        logger.warning(f"No spatial index or tokens found for page {page_no}; skipping doc_item")

    candidate_indices = spatial_index.query(chunk_bbox)
    candidate_geometries = spatial_index.geometries.take(candidate_indices)
    actual_indices = candidate_indices[
        [geom.intersects(chunk_bbox) for geom in candidate_geometries]
    ]
    token_indices = token_indices_array[actual_indices]

    token_ids = [
        {"pageIndex": page_no, "tokenIndex": int(idx)}
        for idx in sorted(token_indices)
    ]
    
    # Create the annotation_json structure
    annotation_json: Dict[int, OpenContractsSinglePageAnnotationType] = {
        page_no: {
            "bounds": {
                "left": bbox.l,
                "top": bbox.t,
                "right": bbox.r,
                "bottom": bbox.b,
            },
            "tokensJsons": token_ids,  # Empty list as per requirements
            "rawText": item_text,
        }
    }
    
    # Create the full annotation structure
    annotation: OpenContractsAnnotationPythonType = {
        "id": getattr(item, "self_ref", None),
        "annotationLabel": str(getattr(item, "label", "")),
        "rawText": item_text,
        "page": page_no,
        "annotation_json": annotation_json,
        "parent_id": None,  # As specified
        "annotation_type": getattr(item, "label", None),
        "structural": True
    }
    
    return annotation

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
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Parses the document and converts it into the OpenContractDocExport format.

        Args:
            user_id (int): The ID of the user.
            doc_id (int): The ID of the document.
            **kwargs: Additional keyword arguments.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data or None if parsing fails.
        """
        logger.info(f"DoclingParser - Parsing doc {doc_id} for user {user_id}")

        # Retrieve the document
        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        # Create a temporary file path
        temp_dir = settings.TEMP_DIR if hasattr(settings, "TEMP_DIR") else "/tmp"
        temp_pdf_path = os.path.join(temp_dir, f"doc_{doc_id}.pdf")
        
        force_ocr = kwargs.get('force_ocr', False)
        if force_ocr:
            logger.info("Force OCR is enabled - this will add additional processing time and may not be necessary. We try to intelligently determine if OCR is needed.")

        # Write the file to a temporary location
        with default_storage.open(doc_path, "rb") as pdf_file:
            with open(temp_pdf_path, "wb") as temp_pdf_file:
                temp_pdf_file.write(pdf_file.read())

        try:
            # Process document through Docling
            result = self.doc_converter.convert(temp_pdf_path)

            if result.status != ConversionStatus.SUCCESS:
                raise Exception(f"Conversion failed: {result.errors}")
            
            doc: DoclingDocument = result.document
            
            pdf_bytes = pdf_file.read()
            
            # Actual processing pipeline
            #########################################################
             # Convert document structure to PAWLS format and get spatial indices and mappings
            pawls_pages, spatial_indices_by_page, tokens_by_page, token_indices_by_page, content = self._generate_pawls_content(doc, pdf_bytes, force_ocr)

            # Run the hierarchical chunker
            chunker = HierarchicalChunker()
            chunks = list(chunker.chunk(dl_doc=doc))
            
            text_lookup = build_text_lookup(doc)
            logger.info(f"Text lookup: {text_lookup}")
            base_annotation_lookup = {text.self_ref: convert_docling_item_to_annotation(text, spatial_indices_by_page, tokens_by_page, token_indices_by_page) for text in doc.texts}

            # Use Chunks to find and apply parent_ids (warning this will )
            for i, chunk in enumerate(chunks):
                
                logger.info(f"Chunk {i} has headings: {chunk.meta.headings}")
                
                # Print headers if they exist
                if chunk.meta.headings:
                    if len(chunk.meta.headings) > 1:
                        logger.warning(f"Docling chunk {i} has multiple headings; this is not supported yet")
                    heading = chunk.meta.headings[0]
                    logger.info(f"Find heading: {heading}")
                    parent_ref = text_lookup.get(heading.strip())
                    logger.info(f"Found parent ref: {parent_ref}")
                else:
                    parent_ref = None
            
                if hasattr(chunk.meta, 'doc_items'):
                    logger.info(f"Number of doc_items: {len(chunk.meta.doc_items)}")
                    
                    # Inspect each doc_item
                    for j, item in enumerate(chunk.meta.doc_items):
                        
                        annotation = base_annotation_lookup.get(item.self_ref)
                        if annotation:
                            annotation['parent_id'] = parent_ref
                        else:
                            logger.error(f"No annotation found in base_annotation_lookup for text item with ref {item.self_ref}")

            # Create OpenContracts document structure
            open_contracts_data: OpenContractDocExport = {
                "title": self._extract_title(doc, Path(doc_path).stem),
                "content": content,
                "description": self._extract_description(doc, self._extract_title(doc, Path(doc_path).stem)),
                "pawls_file_content": pawls_pages,
                "page_count": len(pawls_pages),
                "doc_labels": [],
                "labelled_text": list(base_annotation_lookup.values()),
            } 
            #########################################################

            # IF LLM_ENHANCED_HIERARCHY is True, traverse the structure produced by Docling (which is clean and has nicely separated sections BUT very poor
            # in terms of complex doc hierarchy) and use LLM to infer relationships between sections. EXPERIMENTAL
            if kwargs.get('llm_enhanced_hierarchy', False):
                logger.info("LLM-enhanced hierarchy is enabled - this will add additional processing time but improve hierarchy quality")
                enriched_data = reassign_annotation_hierarchy(open_contracts_data['labelled_text'])
                open_contracts_data['labelled_text'] = enriched_data
                
            # print_labelled_text_hierarchy(open_contracts_data['labelled_text'], "labelled_text_hierarchy.txt")
                
            return open_contracts_data

        except Exception as e:
            logger.error(f"Docling parser failed: {e}")
            return None

        finally:
            # Clean up the temporary file
            if os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)

    def _extract_title(self, doc: DoclingDocument, default_title: str) -> str:
        """
        Extracts the title from the DoclingDocument.

        Args:
            doc (DoclingDocument): The Docling document instance.
            default_title (str): The default title to use if no suitable title is found.

        Returns:
            str: The extracted title or the default title.
        """
        for text in doc.texts:
            if text.label in [DocItemLabel.TITLE, DocItemLabel.PAGE_HEADER]:
                logger.info(f"Title found in first {text.label}: {text.text}")
                return text.text
        logger.info(f"No title found, using default title: {default_title}")
        return default_title

    def _extract_description(
        self, doc: DoclingDocument, title: str
    ) -> str:
        """
        Extracts the description for the document by combining the title and the first paragraph.

        Args:
            doc (DoclingDocument): The Docling document instance.
            title (str): The extracted title.

        Returns:
            str: The description composed of the title and the first paragraph, if available.
        """
        # Initialize description with the title
        description = title

        # Find the first paragraph
        for text in doc.texts:
            if text.label == DocItemLabel.PARAGRAPH:
                description += f"\n{text.text}"
                break

        return description

    def _generate_pawls_content(
        self,
        doc: DoclingDocument,
        doc_bytes: bytes,
        force_ocr: bool = False
    ) -> Tuple[
        List[PawlsPagePythonType],
        Dict[int, STRtree],
        Dict[int, List[PawlsTokenPythonType]],
        Dict[int, np.ndarray],
        str
    ]:
        """
        Convert Docling document content to PAWLS format, build spatial index for tokens,
        and accumulate the document content.

        This method checks if the PDF requires OCR. If not, it uses pdfplumber to extract text and token bounding boxes.
        If OCR is required, it uses pdf2image and pytesseract to extract text and tokens from images.
        In both cases, it constructs the necessary data structures for PAWLS and adjusts coordinates to match the source document.

        Args:
            doc (DoclingDocument): The Docling document instance.
            doc_bytes (bytes): Bytes of the PDF document.

        Returns:
            Tuple containing:
                - List[PawlsPagePythonType]: List of PAWLS page objects with tokens and page information.
                - Dict[int, STRtree]: Mapping from page indices to their corresponding spatial R-tree of token geometries.
                - Dict[int, List[PawlsTokenPythonType]]: Mapping from page indices to lists of tokens.
                - Dict[int, np.ndarray]: Mapping from page indices to arrays of token indices.
                - str: The full content of the document, constructed from the tokens.
        """
        logger.info("Generating PAWLS content")

        pawls_pages: List[PawlsPagePythonType] = []
        spatial_indices_by_page: Dict[int, STRtree] = {}
        tokens_by_page: Dict[int, List[PawlsTokenPythonType]] = {}
        token_indices_by_page: Dict[int, np.ndarray] = {}
        content_parts: List[str] = []

        # Check if PDF requires OCR
        pdf_file_stream = io.BytesIO(doc_bytes)
        needs_ocr = check_if_pdf_needs_ocr(pdf_file_stream)
        logger.info(f"PDF needs OCR: {needs_ocr}")

        if not needs_ocr and not force_ocr:
            # Use pdfplumber to extract tokens and text
            logger.info("Using pdfplumber to extract text and tokens")
            import pdfplumber

            with pdfplumber.open(pdf_file_stream) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    logger.info(f"Processing page number {page_num}")

                    # Get page size from Docling document if available
                    docling_page = doc.pages.get(page_num)
                    if docling_page and docling_page.size:
                        width = docling_page.size.width
                        height = docling_page.size.height
                        logger.info(f"Page dimensions from Docling: width={width}, height={height}")
                    else:
                        # Use page size from pdfplumber
                        width = page.width
                        height = page.height
                        logger.warning(f"No page size in Docling document; using pdfplumber page size: width={width}, height={height}")

                    # Calculate scaling factors to adjust pdfplumber coordinates
                    plumber_width = page.width
                    plumber_height = page.height
                    if plumber_width != width or plumber_height != height:
                        scale_x = width / plumber_width
                        scale_y = height / plumber_height
                        logger.info(f"Scaling pdfplumber coordinates by factors scale_x={scale_x}, scale_y={scale_y}")
                    else:
                        scale_x = 1.0
                        scale_y = 1.0

                    tokens: List[PawlsTokenPythonType] = []
                    geometries: List[box] = []
                    token_indices: List[int] = []
                    page_content_parts: List[str] = []

                    # Extract words with bounding boxes
                    words = page.extract_words()
                    for word in words:
                        x0 = float(word['x0']) * scale_x
                        y0 = float(word['top']) * scale_y
                        x1 = float(word['x1']) * scale_x
                        y1 = float(word['bottom']) * scale_y
                        text = word['text']

                        w = x1 - x0
                        h = y1 - y0
                        y = height - y1  # Flip y-coordinate to match the coordinate system

                        token: PawlsTokenPythonType = {
                            'x': x0,
                            'y': y,
                            'width': w,
                            'height': h,
                            'text': text,
                        }

                        tokens.append(token)
                        page_content_parts.append(text)
                        logger.debug(f"Added token on page {page_num}: {token}")

                        # Create geometry for spatial index
                        token_bbox = box(x0, y, x0 + w, y + h)
                        geometries.append(token_bbox)
                        token_indices.append(len(tokens) - 1)

                    # Append page content to the overall content
                    content_parts.append(' '.join(page_content_parts))

                    # Build spatial index for the page
                    geometries_array = np.array(geometries, dtype=object)
                    token_indices_array = np.array(token_indices)

                    spatial_index = STRtree(geometries_array)
                    spatial_indices_by_page[page_num] = spatial_index
                    tokens_by_page[page_num] = tokens
                    token_indices_by_page[page_num] = token_indices_array

                    # Create PawlsPagePythonType
                    pawls_page: PawlsPagePythonType = {
                        'page': {
                            'width': width,
                            'height': height,
                            'index': page_num,
                        },
                        'tokens': tokens,
                    }

                    pawls_pages.append(pawls_page)
                    logger.info(f"PAWLS content for page {page_num} added")

        else:
            # Use pdf2image and pytesseract to extract tokens and text
            logger.info("Using OCR to extract text and tokens")
            images = pdf2image.convert_from_bytes(doc_bytes)
            for page_num, page_image in enumerate(images, start=1):
                logger.info(f"Processing page number {page_num}")

                # Get page size from Docling document if available
                page = doc.pages.get(page_num)
                if page and page.size:
                    width = page.size.width
                    height = page.size.height
                    logger.info(f"Page dimensions from Docling: width={width}, height={height}")
                else:
                    # Use image size as fallback
                    width, height = page_image.size
                    logger.warning(f"No page size in Docling document; using image size: width={width}, height={height}")

                custom_config = r'--oem 3 --psm 3'
                word_data = pytesseract.image_to_data(
                    page_image,
                    output_type=pytesseract.Output.DICT,
                    config=custom_config
                )

                tokens: List[PawlsTokenPythonType] = []
                geometries: List[box] = []
                token_indices: List[int] = []
                page_content_parts: List[str] = []

                n_boxes = len(word_data['text'])
                for i in range(n_boxes):
                    word_text = word_data['text'][i]
                    conf = int(word_data['conf'][i])

                    # Skip empty or low-confidence words
                    if conf > 0 and word_text.strip():
                        x = float(word_data['left'][i])
                        y = float(word_data['top'][i])
                        w = float(word_data['width'][i])
                        h = float(word_data['height'][i])

                        # Adjust coordinates to match the page size
                        img_width, img_height = page_image.size
                        scale_x = width / img_width
                        scale_y = height / img_height

                        x *= scale_x
                        y *= scale_y
                        w *= scale_x
                        h *= scale_y

                        y = height - y - h  # Flip y-coordinate

                        token: PawlsTokenPythonType = {
                            'x': x,
                            'y': y,
                            'width': w,
                            'height': h,
                            'text': word_text,
                        }

                        tokens.append(token)
                        page_content_parts.append(word_text)
                        logger.debug(f"Added token on page {page_num}: {token}")

                        # Create geometry for spatial index
                        token_bbox = box(x, y, x + w, y + h)
                        geometries.append(token_bbox)
                        token_indices.append(len(tokens) - 1)

                # Append page content to the overall content
                content_parts.append(' '.join(page_content_parts))

                # Build spatial index for the page
                geometries_array = np.array(geometries, dtype=object)
                token_indices_array = np.array(token_indices)

                spatial_index = STRtree(geometries_array)
                spatial_indices_by_page[page_num] = spatial_index
                tokens_by_page[page_num] = tokens
                token_indices_by_page[page_num] = token_indices_array

                # Create PawlsPagePythonType
                pawls_page: PawlsPagePythonType = {
                    'page': {
                        'width': width,
                        'height': height,
                        'index': page_num,
                    },
                    'tokens': tokens,
                }

                pawls_pages.append(pawls_page)
                logger.info(f"PAWLS content for page {page_num} added")

        # Combine content parts into full content
        content = '\n'.join(content_parts)

        return pawls_pages, spatial_indices_by_page, tokens_by_page, token_indices_by_page, content

   # These are LLM-powered post-processors that should be moved elsewhere. They work with any OpenContractDocExport (in theory)
   
