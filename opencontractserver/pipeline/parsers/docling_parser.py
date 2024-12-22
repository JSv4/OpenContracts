import io
import logging
import os
import cv2
import json
import pdf2image
from pathlib import Path
import pytesseract
from shapely.geometry import box
from shapely.strtree import STRtree
from typing import Optional, List, Dict, Any, Tuple
import numpy as np

from django.conf import settings
from django.core.files.storage import default_storage
from docling_core.transforms.chunker.hierarchical_chunker import (
    HierarchicalChunker,
)
from docling_core.transforms.chunker import BaseChunk

from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import DoclingDocument, DocItemLabel

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

#### TEMPORARY (FOR DISPLAY)

def build_hierarchy_map(annotations: List[Dict]) -> Dict[Optional[str], List[Dict]]:
    """
    Build a map from parent_id -> list of child annotations.

    Args:
        annotations (List[Dict]): A list of annotation dictionaries.

    Returns:
        Dict[Optional[str], List[Dict]]: A dictionary mapping parent_id to a list
        of child annotation objects.
    """
    hierarchy_map: Dict[Optional[str], List[Dict]] = {}
    for ann in annotations:
        parent_id = ann.get("parent_id", None)
        if parent_id not in hierarchy_map:
            hierarchy_map[parent_id] = []
        hierarchy_map[parent_id].append(ann)
    return hierarchy_map

def print_hierarchy_to_file(
    annotations: List[Dict],
    out_filename: str = "hierarchy_output.txt",
) -> None:
    """
    Print annotations' text in a hierarchical manner to a text file.

    Args:
        annotations (List[Dict]): The list of annotation dictionaries.
        out_filename (str, optional): The filename where hierarchical output is written.
            Defaults to "hierarchy_output.txt".
    """

    # Build a quick lookup from annotation_id -> annotation object
    annotations_by_id = {a["id"]: a for a in annotations if a.get("id")}

    # Build the child map
    hierarchy_map = build_hierarchy_map(annotations)

    def write_annotation(ann: Dict, depth: int, f) -> None:
        """
        Recursively write annotation and its children to the file with indentation.

        Args:
            ann (Dict): The annotation object.
            depth (int): Current indentation level.
            f (file): The open file handle for writing.
        """
        indent_str = "  " * depth
        text_snip = ann.get("rawText", "").replace("\n", " ").strip()

        # Shorten text snippet if it's too large
        if len(text_snip) > 80:
            text_snip = text_snip[:80] + "..."

        # Write the text snippet
        f.write(f"{indent_str}- {text_snip}\n")

        # Recurse for child annotations
        child_list = hierarchy_map.get(ann["id"], [])
        for child_ann in child_list:
            write_annotation(child_ann, depth + 1, f)

    # Identify top-level annotations (where parent_id = None)
    top_level_anns = hierarchy_map.get(None, [])

    with open(out_filename, "w", encoding="utf-8") as f:
        for top_ann in top_level_anns:
            write_annotation(top_ann, 0, f)

    print(f"Hierarchy has been written to {out_filename}")

####

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
            pawls_pages, spatial_indices_by_page, tokens_by_page, token_indices_by_page, content = self._generate_pawls_content(doc, pdf_bytes)

            # Convert chunks to annotations using the spatial indices and token indices
            annotations = self.convert_chunks_to_annotations(
                doc, 
                spatial_indices_by_page, 
                tokens_by_page, 
                token_indices_by_page
            )

            # Create OpenContracts document structure
            open_contracts_data: OpenContractDocExport = {
                "title": self._extract_title(doc, Path(doc_path).stem),
                "content": content,
                "description": self._extract_description(doc, self._extract_title(doc, Path(doc_path).stem)),
                "pawls_file_content": pawls_pages,
                "page_count": len(pawls_pages),
                "doc_labels": [],
                "labelled_text": annotations,
            } 
            #########################################################

            # IF LLM_ENHANCED_HIERARCHY is True, traverse the structure produced by Docling (which is clean and has nicely separated sections BUT very poor
            # in terms of complex doc hierarchy) and use LLM to infer relationships between sections. EXPERIMENTAL
            if kwargs.get('llm_enhanced_hierarchy', False):
                logger.info("LLM-enhanced hierarchy is enabled - this will add additional processing time but improve hierarchy quality")
                enriched_data = self._assign_hierarchy(open_contracts_data['labelled_text'])
                print_hierarchy_to_file(enriched_data, "hierarchy_output.txt")
                open_contracts_data['labelled_text'] = enriched_data
                
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
        doc_bytes: bytes
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

        if not needs_ocr:
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

    def _preprocess_image_for_ocr(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess the image to enhance OCR accuracy.

        Args:
            image (np.ndarray): The input image in OpenCV format.

        Returns:
            np.ndarray: The preprocessed image ready for OCR.
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Resize image to improve OCR accuracy
        scaling_factor = 2
        width = int(gray.shape[1] * scaling_factor)
        height = int(gray.shape[0] * scaling_factor)
        gray = cv2.resize(gray, (width, height), interpolation=cv2.INTER_LINEAR)

        # Apply bilateral filtering to reduce noise while keeping edges sharp
        gray = cv2.bilateralFilter(gray, 9, 75, 75)

        # Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=31,
            C=2
        )

        # Deskew the image
        coords = np.column_stack(np.where(thresh > 0))
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        (h, w) = thresh.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        thresh = cv2.warpAffine(thresh, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

        return thresh

    def convert_chunks_to_annotations(
        self,
        docling_document: DoclingDocument,
        spatial_indices_by_page: Dict[int, STRtree],
        tokens_by_page: Dict[int, List[PawlsTokenPythonType]],
        token_indices_by_page: Dict[int, np.ndarray]
    ) -> List[OpenContractsAnnotationPythonType]:
        """
        Converts the chunks from a DoclingDocument into OpenContracts annotations.

        This method uses the HierarchicalChunker to generate chunks from the DoclingDocument
        and then maps each chunk to an annotation. It will also log the hierarchy of items
        (including GroupItems, TextItems, etc.) and the hierarchy of chunks with indentation.
        
        Additionally, it logs a snippet of text for each doc item or chunk (for text-based
        items/chunks), to provide a more readable nested format.

        Beyond that, we now also carry over each doc_item's self_ref into the annotation id,
        and adjust the parent_id based on specific rules:
          1) Where parent is '#/body', set parent_id to None
          2) Where parent is '#/groups/X', all items in that group become children of the first item:
                - The first item in that group has parent_id = None
                - All other items in that group have parent_id = that first item
        """
        logger.info("=== Starting Chunk to Annotation Conversion ===")
        logger.info(f"Processing document with {len(docling_document.texts)} text items and {len(docling_document.groups)} groups")

        # ---------------------------------------------------------------------------
        # STEP 1: Gather doc items in a master lookup (by their .self_ref).
        # ---------------------------------------------------------------------------
        logger.info("STEP 1: Building master lookup by self_ref")
        items_by_self_ref: Dict[str, Any] = {}
        for grp in docling_document.groups:
            logger.info(f"Adding group with self_ref: {grp.self_ref}")
            items_by_self_ref[grp.self_ref] = grp
        for text_item in docling_document.texts:
            t_ref = getattr(text_item, "self_ref", None)
            if t_ref:
                logger.info(f"Adding text item with self_ref: {t_ref}")
                items_by_self_ref[t_ref] = text_item
        logger.info(f"Total items in master lookup: {len(items_by_self_ref)}")

        # ---------------------------------------------------------------------------
        # STEP 2: Build a children_map that captures adjacency based on parent references.
        #         This helps us know which items belong to each group or parent item.
        # ---------------------------------------------------------------------------
        logger.info("STEP 2: Building children map")
        children_map: Dict[str, List[str]] = {}

        def record_child(parent_self_ref: str, child_self_ref: str) -> None:
            logger.info(f"Recording child relationship: parent={parent_self_ref} -> child={child_self_ref}")
            if parent_self_ref in children_map:
                children_map[parent_self_ref].append(child_self_ref)
            else:
                children_map[parent_self_ref] = [child_self_ref]

        # For each item, record its parent->child relationship
        for self_ref, obj in items_by_self_ref.items():
            logger.info(f"Processing parent relationships for item: {self_ref}")
            parent_candidate = (
                getattr(obj, "parent_ref", None)
                or getattr(obj, "parent", None)
            )
            if isinstance(parent_candidate, str):
                if parent_candidate in items_by_self_ref:
                    record_child(parent_candidate, self_ref)
            elif parent_candidate is not None and hasattr(parent_candidate, "self_ref"):
                actual_parent_ref = getattr(parent_candidate, "self_ref", None)
                if actual_parent_ref in items_by_self_ref:
                    record_child(actual_parent_ref, self_ref)
            elif parent_candidate is not None and hasattr(parent_candidate, "cref"):
                ref_str = getattr(parent_candidate, "cref", None)
                if ref_str and ref_str in items_by_self_ref:
                    record_child(ref_str, self_ref)

        # If the item has sub_items, also record them
        for ref_key, obj in items_by_self_ref.items():
            logger.info(f"Checking for sub_items in: {ref_key}")
            sub_items = getattr(obj, "items", [])
            for sub_item in sub_items:
                sub_item_ref = getattr(sub_item, "self_ref", None)
                if sub_item_ref and sub_item_ref in items_by_self_ref:
                    record_child(ref_key, sub_item_ref)
                    logger.info(f"Added sub_item relationship: {ref_key} -> {sub_item_ref}")

        logger.info(f"Children map built with {len(children_map)} parent entries")

        # ---------------------------------------------------------------------------
        # STEP 3: Define a function for logging the doc item tree with indentation.
        # ---------------------------------------------------------------------------
        def log_item_hierarchy(item_self_ref: str, depth: int = 0, parent_ref: Optional[str] = None) -> None:
            prefix = "  " * depth
            current_item = items_by_self_ref[item_self_ref]
            obj_type = type(current_item).__name__
            name_attr = getattr(current_item, "name", None)
            label_attr = getattr(current_item, "label", None)
            text_attr = getattr(current_item, "text", None)

            text_snippet = ""
            if text_attr and isinstance(text_attr, str) and len(text_attr.strip()) > 0:
                snippet = text_attr.strip().replace("\n", " ")
                snippet_short = snippet[:35] + ("..." if len(snippet) > 35 else "")
                text_snippet = f" text='{snippet_short}'"

            child_refs = children_map.get(item_self_ref, [])
            num_children = len(child_refs)

            parent_str = f"(parent={parent_ref})" if parent_ref else ""
            logger.info(
                f"{prefix}- {obj_type} self_ref='{item_self_ref}' "
                f"name='{name_attr}' label='{label_attr}' (children={num_children}){text_snippet} {parent_str}"
            )

            for child_ref in child_refs:
                log_item_hierarchy(child_ref, depth + 1, parent_ref=item_self_ref)

        # ---------------------------------------------------------------------------
        # STEP 4: Identify top-level items and log their hierarchy.
        # ---------------------------------------------------------------------------
        all_child_refs = {child for child_list in children_map.values() for child in child_list}
        top_level_item_refs = [ref for ref in items_by_self_ref.keys() if ref not in all_child_refs]

        logger.info("=== Document Hierarchy (Groups, TextItems, etc.) ===")
        for top_ref in top_level_item_refs:
            log_item_hierarchy(top_ref, depth=0, parent_ref=None)
        logger.info("=== End of Document Hierarchy ===")

        # ---------------------------------------------------------------------------
        # STEP 5: Chunk the document and log the chunk hierarchy.
        # ---------------------------------------------------------------------------
        logger.info("=== Chunk Hierarchy ===")
        chunker = HierarchicalChunker()
        chunks = list(chunker.chunk(dl_doc=docling_document))

        def log_chunk_tree(chunk: BaseChunk, depth: int = 0, parent_chunk: Optional[str] = None) -> None:
            prefix = "  " * depth
            child_chunks = getattr(chunk, "children", [])
            text_preview_full = (chunk.text or "").replace("\n", " ").strip()
            text_preview_short = text_preview_full[:35] + ("..." if len(text_preview_full) > 35 else "")
            num_children = len(child_chunks)
            parent_str = f"(parent-chunk='{parent_chunk[:25]}...')" if parent_chunk else ""
            schema_str = chunk.meta.schema_name if (chunk.meta and chunk.meta.schema_name) else "N/A"

            logger.info(
                f"{prefix}- Chunk schema='{schema_str}' (children={num_children}) text='{text_preview_short}' {parent_str}"
            )

            for child in child_chunks:
                log_chunk_tree(child, depth + 1, parent_chunk=text_preview_full)

        for top_chunk in chunks:
            log_chunk_tree(top_chunk, depth=0, parent_chunk=None)
        logger.info("=== End of Chunk Hierarchy ===")

        # ---------------------------------------------------------------------------
        # STEP 6: Build OpenContracts annotations from the chunk results.
        #
        #   doc_item.self_ref -> annotation["id"]
        #
        #   For annotation["parent_id"]:
        #     a) If parent is "#/body" => None
        #     b) If parent is "#/groups/X", we want the group's *first item* to have None,
        #        and all subsequent items in that group to have that first item as parent.
        #
        # ---------------------------------------------------------------------------
        annotations: List[OpenContractsAnnotationPythonType] = []

        def gather_all_chunks(c: BaseChunk, accumulator: List[BaseChunk]) -> None:
            accumulator.append(c)
            for child_chunk in getattr(c, "children", []):
                gather_all_chunks(child_chunk, accumulator)

        all_chunks: List[BaseChunk] = []
        for root_chunk in chunks:
            gather_all_chunks(root_chunk, all_chunks)

        def get_annotation_parent_id(item: Any) -> Optional[str]:
            """
            Returns the effective parent ID based on the item:
              1) If parent is '#/body' => None
              2) If parent is '#/groups/X':
                   => if this item is the first child of that group => parent is None
                   => else => parent is self_ref of that first child
              3) Else, fallback to parent's self_ref (or None).
            """
            logger.info(f"Getting parent ID for item {type(item)}: {item}")
            candidate_parent = getattr(item, "parent_ref", None) or getattr(item, "parent", None)
            logger.info(f"\tCandidate parent: {candidate_parent}")
            this_self_ref = getattr(item, "self_ref", None)
            logger.info(f"\tThis self_ref: {this_self_ref}")

            def parent_ref_str_or_none(parent):
                if isinstance(parent, str):
                    return parent
                elif parent is not None:
                    return getattr(parent, "self_ref", None) or getattr(parent, "cref", None)
                return None

            parent_str = parent_ref_str_or_none(candidate_parent)
            logger.info(f"\tParent str ({type(parent_str)}): {parent_str}")
            if parent_str == "#/body":
                return None

            # If the parent is a group
            if parent_str and parent_str.startswith("#/groups/"):
                # look up all children of that group
                group_children = children_map.get(parent_str, [])
                logger.info(f"\tGroup children: {group_children}")
                if not group_children:
                    # if no children, nothing we can do
                    logger.info("\tNo children, returning None")
                    return None
                

                # The first child
                first_child = group_children[0]
                # If this item is the first child, parent is None
                if this_self_ref == first_child:
                    logger.info("\tThis item is the first child, returning None")
                    return None
                # Otherwise, the parent is that first_child
                logger.info(f"\tOtherwise, the parent is that first_child: {first_child}")
                return first_child

            logger.info(f"\tFallback to whatever we found: {parent_str}")

            # Else fallback to whatever we found
            return parent_str if parent_str else None

        for chunk in all_chunks:
            # Skip chunk if no doc_items
            if not chunk.meta or not chunk.meta.doc_items:
                logger.warning("Chunk meta does not have doc_items; skipping chunk")
                continue

            # Instead of just doc_item = chunk.meta.doc_items[0],
            # process all doc_items in this chunk:
            for doc_item in chunk.meta.doc_items:

                # Skip doc_item if it has no provenance data
                if not doc_item.prov or len(doc_item.prov) == 0:
                    logger.warning("DocItem does not have provenance data; skipping item")
                    continue

                # Use the first provenance if multiple
                prov = doc_item.prov[0]
                page_no = prov.page_no
                bbox = prov.bbox

                logger.debug(f"Processing doc_item = {doc_item.self_ref} on page {page_no} with bbox={bbox}")

                # Decide on label by majority vote among doc_items in chunk (or fallback)
                labels = [di.label for di in chunk.meta.doc_items if hasattr(di, "label")]
                label = max(set(labels), key=labels.count) if labels else "UNKNOWN"

                # Build bounding box geometry
                chunk_bbox = box(bbox.l, bbox.t, bbox.r, bbox.b)
                spatial_index = spatial_indices_by_page.get(page_no)
                tokens = tokens_by_page.get(page_no)
                token_indices_array = token_indices_by_page.get(page_no)

                if spatial_index is None or tokens is None or token_indices_array is None:
                    logger.warning(f"No spatial index or tokens found for page {page_no}; skipping doc_item")
                    continue

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

                annotation_json: Dict[int, OpenContractsSinglePageAnnotationType] = {
                    page_no: {
                        "bounds": {
                            "left": bbox.l,
                            "top": bbox.t,
                            "right": bbox.r,
                            "bottom": bbox.b,
                        },
                        "tokensJsons": token_ids,
                        "rawText": chunk.text,
                    }
                }

                # Calculate parent_id using the existing logic
                parent_id = get_annotation_parent_id(doc_item)

                annotation: OpenContractsAnnotationPythonType = {
                    "id": getattr(doc_item, "self_ref", None),
                    "annotationLabel": label,
                    "rawText": chunk.text,
                    "page": page_no,
                    "annotation_json": annotation_json,
                    "parent_id": parent_id,
                    "annotation_type": getattr(doc_item, "label", None),
                    "structural": True,
                }

                annotations.append(annotation)
                logger.info(
                    f"Annotation created for doc_item={annotation['id']} on page {page_no} "
                    f"with parent_id={annotation['parent_id']}"
                )

        return annotations

    def process_document_text_boxes(self, doc: DoclingDocument, doc_bytes: bytes) -> Dict[int, List[PawlsTokenPythonType]]:
        """Process all text items in a DoclingDocument to extract word-level bounding boxes.

        Args:
            doc (DoclingDocument): The Docling document instance.
            doc_bytes (bytes): The PDF document as bytes.

        Returns:
            Dict[int, List[PawlsTokenPythonType]]: A dictionary mapping page numbers to lists of tokens.
        """
        from collections import defaultdict
        result: Dict[int, List[PawlsTokenPythonType]] = {}
        
        expected_tokens_per_page = defaultdict(int)
        for text_item in doc.texts:
            for prov in text_item.prov:
                expected_tokens_per_page[prov.page_no] += len(text_item.text.split())

        # Process each page
        images = pdf2image.convert_from_bytes(doc_bytes)
         
        for page_no, page_item in doc.pages.items():
            
            if not page_item.image:
                continue
            
            # Get page size
            if page_item.size:
                width = page_item.size.width
                height = page_item.size.height
                logger.info(f"Page {page_no} dimensions: width={width}, height={height}")
            else:
                # Get dimensions from the Pillow image
                width, height = images[page_no - 1].size
                logger.warning(f"Page size not found in doc, using image dimensions: width={width}, height={height}")
            
            expected_tokens = expected_tokens_per_page[page_no]
            if expected_tokens == 0:
                continue
            
            # Get page image
            page_image = images[page_no - 1]
            if not page_image:
                continue
            
            # Convert PIL to OpenCV format for this page
            cv_image = cv2.cvtColor(np.array(page_image), cv2.COLOR_RGB2BGR)
            
            # Calculate scaling factors to convert coordinates from cv_image to page coordinate system
            scale_x = width / cv_image.shape[1]
            scale_y = height / cv_image.shape[0]
            
            page_word_boxes: List[PawlsTokenPythonType] = []
            
            # Process each text item
            for text_item in doc.texts:
                # Process each provenance item that refers to this page
                for prov in text_item.prov:
                    if prov.page_no != page_no:
                        continue
                    
                    # Get ROI for this text block
                    logger.info(f"Processing text item: {text_item.text}")
                    bbox = prov.bbox
                    x = int(bbox.l)
                    y = int(bbox.b)
                    w = int(bbox.r) - x
                    h = int(bbox.t) - y

                    # Ensure ROI is within image boundaries
                    y_min = max(0, y)
                    y_max = min(cv_image.shape[0], y + h)
                    x_min = max(0, x)
                    x_max = min(cv_image.shape[1], x + w)
                    roi = cv_image[y_min:y_max, x_min:x_max]
                                        
                    # Convert to grayscale
                    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                    
                    # Apply adaptive thresholding
                    binary = cv2.adaptiveThreshold(
                        gray,
                        255,
                        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                        cv2.THRESH_BINARY_INV,
                        blockSize=15,
                        C=10
                    )
                    
                    # Define kernel size relative to ROI width
                    kernel_width = max(1, w // (expected_tokens * 2))
                    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))

                    # Dilate and erode to connect words
                    dilated = cv2.dilate(binary, kernel, iterations=1)
                    eroded = cv2.erode(dilated, kernel, iterations=1)
                    
                    # Find contours
                    contours, _ = cv2.findContours(eroded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    # Process contours into bounding boxes
                    word_boxes = []
                    for contour in contours:
                        x_rel, y_rel, w_rel, h_rel = cv2.boundingRect(contour)
                        
                        # Convert to absolute coordinates in cv_image coordinate system
                        x_abs = x_min + x_rel
                        y_abs = y_min + y_rel
                        width_abs = w_rel
                        height_abs = h_rel
                        
                        # Scale coordinates to match page coordinate system
                        x_scaled = x_abs * scale_x
                        y_scaled = y_abs * scale_y
                        width_scaled = width_abs * scale_x
                        height_scaled = height_abs * scale_y
                        
                        word_box = {
                            "x": float(x_scaled),
                            "y": float(y_scaled),
                            "width": float(width_scaled),
                            "height": float(height_scaled)
                        }
                        word_boxes.append(word_box)
                    
                    # Sort boxes left-to-right
                    word_boxes = sorted(word_boxes, key=lambda b: b["x"])
                    logger.info(f"Found {len(word_boxes)} word boxes: {word_boxes}")
                    
                    words = text_item.text.split()
                    if len(word_boxes) != len(words):
                        logger.warning(
                            f"Mismatch in word count for text item. "
                            f"Expected {len(words)} words but found {len(word_boxes)} boxes."
                        )
                    
                    # Match boxes with words (adjust as necessary)
                    for i, word in enumerate(words):
                        if i < len(word_boxes):
                            box = word_boxes[i]
                            box["text"] = word
                            page_word_boxes.append(box)
                        else:
                            logger.warning(f"No bounding box found for word '{word}'")
            
            # Store results for this page
            result[page_no] = page_word_boxes
            logger.info(f"Processed {len(page_word_boxes)} tokens on page {page_no}")
        
        return result

    def process_document_tokens(
        self, 
        doc: DoclingDocument, 
        doc_bytes: bytes
    ) -> Dict[int, List[PawlsTokenPythonType]]:
        """
        Process all pages in a DoclingDocument to extract word-level bounding boxes using OpenCV.

        This method processes each page of the document as a whole, utilizing OpenCV techniques to
        detect word bounding boxes across the entire page, rather than processing per text item.

        Args:
            doc (DoclingDocument): The Docling document instance.
            doc_bytes (bytes): The PDF document as bytes.

        Returns:
            Dict[int, List[PawlsTokenPythonType]]: A dictionary mapping page numbers to lists of tokens.
        """
        result: Dict[int, List[PawlsTokenPythonType]] = {}

        # Convert PDF pages to images
        images = pdf2image.convert_from_bytes(doc_bytes)

        for page_no, page_item in doc.pages.items():
            logger.info(f"Processing page {page_no}")

            # Get page image
            page_index = page_no - 1  # Adjust for zero-based index
            if page_index >= len(images):
                logger.warning(f"No image found for page {page_no}")
                continue
            page_image = images[page_index]

            # Convert PIL image to OpenCV format
            cv_image = cv2.cvtColor(np.array(page_image), cv2.COLOR_RGB2BGR)

            # Get page size for scaling
            if page_item.size:
                width = page_item.size.width
                height = page_item.size.height
                logger.info(f"Page dimensions from Docling: width={width}, height={height}")
            else:
                width, height = page_image.size
                logger.warning(f"Page size not found in Docling document, using image size: width={width}, height={height}")

            # Calculate scaling factors to match page coordinate system
            scale_x = width / cv_image.shape[1]
            scale_y = height / cv_image.shape[0]

            # Preprocess the image to enhance word detection
            gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)

            # Apply adaptive thresholding to get binary image
            binary = cv2.adaptiveThreshold(
                gray,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV,
                blockSize=15,
                C=15
            )

            # Define structuring element and dilate to connect text contours
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            dilated = cv2.dilate(binary, kernel, iterations=1)

            # Find contours
            contours, _ = cv2.findContours(
                dilated, 
                cv2.RETR_EXTERNAL, 
                cv2.CHAIN_APPROX_SIMPLE
            )

            # Collect word bounding boxes
            word_boxes: List[PawlsTokenPythonType] = []

            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                # Filter out small regions that are unlikely to be words
                if w < 10 or h < 10:
                    continue

                # Scale coordinates to match the page coordinate system
                x_scaled = x * scale_x
                y_scaled = y * scale_y
                w_scaled = w * scale_x
                h_scaled = h * scale_y

                # Extract the ROI for OCR
                roi = cv_image[y:y + h, x:x + w]

                # Perform OCR on the ROI
                text = pytesseract.image_to_string(
                    roi, 
                    config='--psm 7',  # Treat the image as a single text line
                    lang='eng'
                ).strip()

                if text:
                    token: PawlsTokenPythonType = {
                        'x': float(x_scaled),
                        'y': float(y_scaled),
                        'width': float(w_scaled),
                        'height': float(h_scaled),
                        'text': text,
                    }
                    word_boxes.append(token)
                    logger.info(f"Detected token: {token}")

            # Optionally sort tokens top-to-bottom, left-to-right
            word_boxes = sorted(word_boxes, key=lambda b: (b['y'], b['x']))

            # Store tokens for this page
            result[page_no] = word_boxes
            logger.info(f"Extracted {len(word_boxes)} tokens from page {page_no}")

        return result

    def _assign_hierarchy(
        self,
        annotations: list[OpenContractsAnnotationPythonType],
        look_behind: int = 16
    ) -> list[OpenContractsAnnotationPythonType]:
        """
        Assigns a hierarchical structure to annotations in two main steps:

        1) Determine indent levels for each annotation (excluding 'page_header' or 'page_footer'
           items) by calling _call_gpt_for_indent. We store the calculated indent level
           in an intermediate data structure. Any annotations with label == 'page_header'
           or 'page_footer' remain with indent_level=None and are NOT considered in the
           indentation logic (treated as top-level).

        2) Once all indent levels are assigned for the relevant items, we traverse the
           complete set (including page_header/page_footer) in the order they appear
           (assuming the input is already in proper reading order) and set parent-child
           relationships. The parent is decided by the usual indentation stack approach.
           Any annotation with page_header/page_footer keeps parent_id=None and is excluded
           from indentation stack usage.

        Args:
            annotations (list[OpenContractsAnnotationPythonType]): The list of annotations.

        Returns:
            list[OpenContractsAnnotationPythonType]: The updated list of annotations,
            now enriched with parent_id fields and arranged in a hierarchy based on indent levels.
        """
        logger.info("=== Starting Hierarchy Assignment ===")
        logger.info(f"Processing {len(annotations)} annotations")

        # -------------------------------------------------------------------------
        # STEP A: Build an enriched list with basic page/coords info.
        #         We'll set indent_level to None initially.
        # -------------------------------------------------------------------------
        annotations_enriched: list[dict[str, Any]] = []
        for ann in annotations:
            page_no = ann["page"]
            label = ann.get("annotationLabel") or "UNLABELED"

            top_coord = 0.0
            left_coord = 0.0

            ann_json = ann["annotation_json"]
            if isinstance(ann_json, dict) and len(ann_json) > 0:
                first_page_key = list(ann_json.keys())[0]
                single_page_data = ann_json[first_page_key]
                bounds = single_page_data.get("bounds", {})
                top_coord = float(bounds.get("top", 0.0))
                left_coord = float(bounds.get("left", 0.0))

            text_snip = (ann["rawText"] or "")[:256].replace("\n", " ")

            annotations_enriched.append({
                "original": ann,
                "page": page_no,
                "top": top_coord,
                "left": left_coord,
                "text_snip": text_snip,
                "label": label,
                "indent_level": None,  # will be set for non-header/footer items
            })

        logger.info("Not sorting by page/top; assuming reading order is already correct.")

        # -------------------------------------------------------------------------
        # STEP B: Identify items that should get an indent_level (non-header/footer).
        # -------------------------------------------------------------------------
        hierarchy_candidates = [
            itm for itm in annotations_enriched
            if itm["label"].lower() not in ["page_header", "pagefooter", "page_footer"]
        ]
        if hierarchy_candidates:
            hierarchy_candidates[0]["indent_level"] = 0

        # We'll guess indent level for each item based on context of previous ~10
        for i, data in enumerate(hierarchy_candidates):
            text_snip = data["text_snip"]
            label = data["label"]
            x_indent = data["left"]

            previous_items = hierarchy_candidates[max(0, i - look_behind): i]
            gpt_stack = []
            for prev_it in previous_items:
                gpt_stack.append({
                    "indent_level": prev_it["indent_level"],
                    "text_snip": prev_it["text_snip"],
                    "label": prev_it["label"],
                    "x_indent": prev_it["left"],
                })

            indent_level = self._call_gpt_for_indent(
                stack=gpt_stack,
                text_snip=text_snip,
                label=label,
                x_indent=x_indent,
            )
            data["indent_level"] = indent_level

        # -------------------------------------------------------------------------
        # STEP C: Assign parent-child relationships using an indentation stack.
        #         Skip page_header/page_footer items in the stack logic.
        # -------------------------------------------------------------------------
        updated_annotations_map: dict[int, OpenContractsAnnotationPythonType] = {}
        indent_stack: list[int] = []

        for idx, data in enumerate(annotations_enriched):
            ann = data["original"]
            label_lower = data["label"].lower()
            indent_level = data["indent_level"]

            if label_lower in ["page_header", "pagefooter", "page_footer"]:
                ann["parent_id"] = None
                updated_annotations_map[idx] = ann
                continue

            # If for any reason it's still None here, set to 0.
            if indent_level is None:
                indent_level = 0

            while len(indent_stack) > indent_level:
                indent_stack.pop()

            while len(indent_stack) < indent_level:
                if indent_stack:
                    indent_stack.append(idx)
                else:
                    indent_level = 0
                    break

            if indent_level == 0:
                parent_id = None
            else:
                parent_idx = indent_stack[indent_level - 1]
                parent_id = annotations_enriched[parent_idx]["original"]["id"]

            ann["parent_id"] = parent_id

            if len(indent_stack) == indent_level:
                indent_stack.append(idx)
            else:
                indent_stack[indent_level] = idx

            updated_annotations_map[idx] = ann

        updated_annotations: list[OpenContractsAnnotationPythonType] = [
            updated_annotations_map[i]
            for i in sorted(updated_annotations_map.keys())
        ]

        logger.info("=== Hierarchy Assignment Complete ===")
        logger.info(f"Processed {len(updated_annotations)} annotations")
        return updated_annotations

    def _call_gpt_for_indent(self, stack: list[dict], text_snip: str, label: str, x_indent: float, max_indent: int = 12) -> int:
        """
        Uses Marvin's extract function to predict a hierarchical indent level
        for an annotation based on a partial text snippet, the annotation label,
        and its left bounding box coordinate (x_indent).

        Args:
            text_snip (str): Up to 256 characters of the annotation text.
            label (str): The annotation label (e.g., "Heading", "Sub-Heading", etc.).
            x_indent (float): The left bounding box coordinate.
            max_indent (int): The maximum indent level we allow (defaults to 8).

        Returns:
            int: The predicted indent level in the range [0, max_indent].
        """
        logger.info("\n=== GPT Indent Level Request ===")
        logger.info(f"Text Snippet: {text_snip[:100]}...")  # First 100 chars
        logger.info(f"Label: {label}")
        logger.info(f"X-Indent: {x_indent}")
        logger.info(f"Max Indent: {max_indent}")
        logger.info(f"Previous Stack Size: {len(stack)}")
        
        import marvin
        marvin.settings.openai.api_key = settings.OPENAI_API_KEY
        marvin.settings.openai.chat.completions.model = 'gpt-4o'

        # Create a short prompt to guide Marvin
        query = (
            "We are traversing a document with nested sections, section-by-section, and are trying to guess indent levels of text blocks.\n" 
            "Based on preceding sections. For new blocks, We're using the first 256 characters, plus its x coordinate visual indent on page (not\n" 
            "dispositive, btw), its label, and preceding blocks' content and resolvedindent levels to guess new block's indentation \n"
            f"level. The following annotations have already been assigned indent levels:\n\n{json.dumps(stack)}\n\n"
            f"Now,based on previous blocks, please make your best guess appropriate indent level of block with\n"
            "Characteristics below. Text snippet of new block and preceding blocks should be most valuable for this\n" 
            "and use clues like numbering, context, references to previous sections (numbered or otherwose) to make your decision,\n"
            " but please use other information like x position on page, preceding blocks' indent levels, etc.\n\n"
            f"===NEW BLOCK===\nPartial text snippet:{text_snip}"
            f"Annotation label: {label}\n"
            f"x_indent value: {x_indent}\n===END NEW BLOCK===\n\n"
            "Provide an indent level (integer) in the range [0, "
            f"{max_indent}] that best represents the hierarchy depth of new block, with 0 being the parent (top-level) and {max_indent} being the leaf (lowest level)."
        )
        logger.info(f"Generated Query:\n{query}")

        instructions = (
            f"Return only an integer in the range [0, {max_indent}] that indicates "
            "the indent depth for the new annotation based on the depths that have already "
            "been assigned to preceding text blocks."
        )
        logger.info(f"Instructions:\n{instructions}")

        indent_candidates: list[int] = marvin.extract(
            query,
            target=int,
            instructions=instructions
        )
        logger.info(f"Received Candidates: {indent_candidates}")

        if indent_candidates:
            result = max(0, min(indent_candidates[0], max_indent))
            logger.info(f"Selected Indent Level: {result}")
            return result
        
        logger.info("No valid candidates received, defaulting to 0")
        return 0

