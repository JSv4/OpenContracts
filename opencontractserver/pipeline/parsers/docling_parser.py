from collections import defaultdict
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
from PIL import Image

from django.conf import settings
from django.core.files.storage import default_storage
from docling_core.transforms.chunker.hierarchical_chunker import (
    HierarchicalChunker,
)
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


def adjust_params_for_word_count(binary_image: np.ndarray, target_word_count: int, 
                               max_attempts: int = 10) -> List[np.ndarray]:
    """Attempt to find CV2 parameters that yield the target number of word boxes.
    
    Uses a series of increasingly aggressive morphological operations to try to
    match the target word count.
    """
    # Parameters to try, from conservative to aggressive
    kernel_size_factors = [80, 60, 40, 100, 120]  # divide image width by these
    dilation_iterations = [3, 2, 4, 1, 5]
    erosion_iterations = [2, 1, 3, 4, 2]
    
    best_contours = None
    best_diff = float('inf')
    
    for attempt in range(max_attempts):
        # Get parameters for this attempt
        kernel_factor = kernel_size_factors[attempt % len(kernel_size_factors)]
        dil_iter = dilation_iterations[attempt % len(dilation_iterations)]
        ero_iter = erosion_iterations[attempt % len(erosion_iterations)]
        
        # Calculate kernel size
        kernel_len = max(np.array(binary_image).shape[1]//kernel_factor, 3)
        hori_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_len, 1))
        
        # Apply morphological operations
        dilated = cv2.dilate(binary_image, hori_kernel, iterations=dil_iter)
        eroded = cv2.erode(dilated, hori_kernel, iterations=ero_iter)
        
        # Find contours
        contours, _ = cv2.findContours(eroded, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter small contours
        valid_contours = [c for c in contours if cv2.boundingRect(c)[2] >= 10]
        
        # Check how close we are to target
        diff = abs(len(valid_contours) - target_word_count)
        
        if diff == 0:  # Perfect match
            return valid_contours
        
        if diff < best_diff:
            best_diff = diff
            best_contours = valid_contours
            
        if diff <= 1:  # Close enough
            break
            
    return best_contours or []

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
        Parses the document and converts it into the OpenContractDocExport format.

        Args:
            user_id (int): The ID of the user.
            doc_id (int): The ID of the document.

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
            
            logger.info(f"Result: {dir(result)}")

            doc: DoclingDocument = result.document
            
            pdf_bytes = pdf_file.read()
            
            # cv2_results = self.process_document_text_boxes(doc, pdf_bytes)
            # with open("cv2_results.json", "w") as f:    
            #     json.dump(cv2_results, f, indent=4)
            # cv2_results_two = self.process_document_tokens(doc, pdf_bytes)
            # with open("cv2_results_two.json", "w") as f:    
            #     json.dump(cv2_results_two, f, indent=4)
            
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
            logger.info(f"OpenContracts data: {open_contracts_data}")
            with open("open_contracts_data.json", "w") as f:
                json.dump(open_contracts_data, f, indent=4)
            #########################################################

            # # Return parsed data
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

        Args:
            docling_document (DoclingDocument): The Docling document instance.
            spatial_indices_by_page (Dict[int, STRtree]): 
                Mapping from page indices to spatial indices (R-tree) of tokens.
            tokens_by_page (Dict[int, List[PawlsTokenPythonType]]):
                Mapping from page indices to lists of tokens.
            token_indices_by_page (Dict[int, np.ndarray]):
                Mapping from page indices to arrays of token indices.

        Returns:
            List[OpenContractsAnnotationPythonType]: The list of annotations extracted from chunks.
        """
        logger.info("Converting chunks to OpenContracts annotations")

        annotations: List[OpenContractsAnnotationPythonType] = []
        chunker = HierarchicalChunker()
        chunks = list(chunker.chunk(dl_doc=docling_document))

        for chunk in chunks:
            logger.debug(f"Processing chunk: {chunk}")

            # Extract metadata from chunk.meta.doc_items
            if chunk.meta and chunk.meta.doc_items:
                doc_item = chunk.meta.doc_items[0]  # Use the first DocItem
                if doc_item.prov and len(doc_item.prov) > 0:
                    prov = doc_item.prov[0]  # Use the first ProvenanceItem
                    page_no = prov.page_no
                    bbox = prov.bbox
                    logger.debug(f"Chunk is on page {page_no} with bbox {bbox}")
                else:
                    logger.warning("DocItem does not have provenance data; skipping chunk")
                    continue
            else:
                logger.warning("Chunk meta does not have doc_items; skipping chunk")
                continue

            # Extract label from doc_items
            labels = [item.label for item in chunk.meta.doc_items if hasattr(item, 'label')]
            if labels:
                # If labels are not consistent, you may choose to handle it differently
                # Here, we'll simply use the most common label
                label = max(set(labels), key=labels.count)
            else:
                label = "UNKNOWN"
            logger.debug(f"Using label '{label}' for chunk.")

            # Create bounding box in PDF coordinate space
            chunk_bbox = box(bbox.l, bbox.t, bbox.r, bbox.b)

            # Access the spatial index and tokens for the page
            spatial_index = spatial_indices_by_page.get(page_no)
            tokens = tokens_by_page.get(page_no)
            token_indices_array = token_indices_by_page.get(page_no)

            if spatial_index is None or tokens is None or token_indices_array is None:
                logger.warning(f"No spatial index or tokens found for page {page_no}; skipping chunk")
                continue

            # Query the spatial index to get indices of candidate geometries
            candidate_indices = spatial_index.query(chunk_bbox)

            # Filter geometries that actually intersect
            candidate_geometries = spatial_index.geometries.take(candidate_indices)
            actual_indices = candidate_indices[
                [geom.intersects(chunk_bbox) for geom in candidate_geometries]
            ]

            # Retrieve token indices
            token_indices = token_indices_array[actual_indices]

            # Create TokenIdPythonType list
            token_ids = [
                {
                    'pageIndex': page_no,
                    'tokenIndex': int(idx)
                }
                for idx in sorted(token_indices)
            ]

            # Build the annotation JSON
            annotation_json: Dict[int, OpenContractsSinglePageAnnotationType] = {
                page_no: {
                    'bounds': {
                        'left': bbox.l,
                        'top': bbox.t,
                        'right': bbox.r,
                        'bottom': bbox.b,
                    },
                    'tokensJsons': token_ids,
                    'rawText': chunk.text
                }
            }

            annotation: OpenContractsAnnotationPythonType = {
                'id': None,
                'annotationLabel': label,
                'rawText': chunk.text,
                'page': page_no,
                'annotation_json': annotation_json,
                'parent_id': None,
                'annotation_type': None,
                'structural': True
            }

            annotations.append(annotation)
            logger.info(f"Annotation created for chunk on page {page_no}")

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
