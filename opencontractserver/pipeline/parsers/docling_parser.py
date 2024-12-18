from collections import defaultdict
import logging
import os
import cv2
import json
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
            
            # Actual processing pipeline
            #########################################################
             # Convert document structure to PAWLS format and get spatial indices and mappings
            pawls_pages, spatial_indices_by_page, tokens_by_page, token_indices_by_page, content = self._generate_pawls_content(doc)

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
            
            

            # # Log the basic properties of the DoclingDocument
            # logger.info(f"DoclingDocument version: {doc.version}")
            # logger.info(f"Number of pages: {len(doc.pages)}")
            # logger.info(f"Number of texts: {len(doc.texts)}")
            # logger.info(f"Number of tables: {len(doc.tables)}")
            # logger.info(f"Number of pictures: {len(doc.pictures)}")
            # logger.info(f"Number of groups: {len(doc.groups)}")
            # logger.info(f"Metadata: {doc.key_value_items}")

            # # Unpack and log detailed structures
            # for i, page in doc.pages.items():
            #     logger.info(f"Page {i}: size=({page.size.width}, {page.size.height}, {page.image.pil_image})")
                
            #     # print(pytesseract.image_to_boxes(page.image.pil_image))
            #     word_data = pytesseract.image_to_data(page.image.pil_image, output_type=pytesseract.Output.DICT)
    
            #     # Create a list to store word boxes
            #     word_boxes = []
                
            #     # Process each word
            #     n_boxes = len(word_data['text'])
            #     for i in range(n_boxes):
            #         # Skip empty text
            #         if int(word_data['conf'][i]) > 0:
            #             word_info = {
            #                 'text': word_data['text'][i],
            #                 'confidence': word_data['conf'][i],
            #                 'box': {
            #                     'x': word_data['left'][i],
            #                     'y': word_data['top'][i],
            #                     'width': word_data['width'][i],
            #                     'height': word_data['height'][i]
            #                 },
            #                 'block_num': word_data['block_num'][i],
            #                 'line_num': word_data['line_num'][i],
            #                 'word_num': word_data['word_num'][i]
            #             }
            #             word_boxes.append(word_info)
            
            #     logger.info(f"Word boxes: {word_boxes}")
                
            # """
            # a 208 607 211 611 0
            # i 211 607 215 611 0
            # v 215 607 216 611 0
            # e 218 607 222 611 0
            # r 222 607 227 611 0
            # """

            # for i, text_item in enumerate(doc.texts):
            #     logger.info(
            #         f"Text[{i}]: text={text_item.text[:50]}, children={text_item.children}, "
            #         f"label={text_item.label}, model_config={text_item.model_config}, "
            #         f"orig={text_item.orig}, parent={text_item.parent}, "
            #         f"prov={text_item.prov}, self_ref={text_item.self_ref}"
            #     )

            # for i, table_item in enumerate(doc.tables):
            #     logger.info(f"Table[{i}]: rows={len(table_item.rows)}")

            # for i, picture_item in enumerate(doc.pictures):
            #     logger.info(f"Picture[{i}]: bbox={picture_item.bbox}")

            # # Log groups and their properties
            # for i, group in enumerate(doc.groups):
            #     logger.info(
            #         f"Group[{i}]: children={group.children}, label={group.label}, "
            #         f"model_config={group.model_config}, name={group.name}, "
            #         f"parent={group.parent}, self_ref={group.self_ref}"
            #     )

            # # Log furniture (headers/footers)
            # if doc.furniture:
            #     logger.info("Document has furniture (headers/footers).")
            #     logger.info(
            #         f"Furniture: children={doc.furniture.children}, label={doc.furniture.label}, "
            #         f"model_config={doc.furniture.model_config}, name={doc.furniture.name}, "
            #         f"parent={doc.furniture.parent}, self_ref={doc.furniture.self_ref}"
            #     )
            # else:
            #     logger.info("No furniture in document.")

            # # Log body hierarchy
            # if doc.body:
            #     logger.info("Logging document body hierarchy.")
            #     logger.info(
            #         f"Body: children={doc.body.children}, label={doc.body.label}, "
            #         f"model_config={doc.body.model_config}, name={doc.body.name}, "
            #         f"parent={doc.body.parent}, self_ref={doc.body.self_ref}"
            #     )
            # else:
            #     logger.info("No body in document.")

            # annotations = self.convert_chunks_to_annotations(doc)
            # logger.info(f"Annotations: {annotations}")

            # # Extract plain text content without formatting
            # content = doc.export_to_markdown(strict_text=True)
            # with open("content.txt", "w") as f:
            #     f.write(content)

            # # Log the extracted content length
            # logger.info(f"Extracted content length: {len(content)} characters")

            # # Convert document structure to PAWLS format and get spatial indices
            # pawls_pages, spatial_indices_by_page, tokens_by_page = self._generate_pawls_content(doc)

            # # Convert chunks to annotations using the spatial indices
            # annotations = self.convert_chunks_to_annotations(doc, spatial_indices_by_page, tokens_by_page)

            # # Create OpenContracts document structure
            # open_contracts_data: OpenContractDocExport = {
            #     "title": self._extract_title(doc, Path(doc_path).stem),
            #     "content": content,
            #     "description": self._extract_description(doc, self._extract_title(doc, Path(doc_path).stem)),
            #     "pawls_file_content": pawls_pages,
            #     "page_count": len(pawls_pages),
            #     "doc_labels": [],
            #     "labelled_text": annotations,
            # }

            # # Log the final OpenContracts data structure
            # logger.info(f"OpenContracts data: {open_contracts_data}")

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
        doc: DoclingDocument
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

        Args:
            doc (DoclingDocument): Docling document object.

        Returns:
            Tuple containing:
                - List[PawlsPagePythonType]: List of PAWLS page objects with tokens and page information.
                - Dict[int, STRtree]: Mapping from page indices to their corresponding spatial R-tree of token geometries.
                - Dict[int, List[PawlsTokenPythonType]]: Mapping from page indices to lists of tokens.
                - Dict[int, np.ndarray]: Mapping from page indices to arrays of token indices.
                - str: The full content of the document, constructed from the tokens.
        """
        logger = logging.getLogger(__name__)
        logger.info("Generating PAWLS content")

        pawls_pages: List[PawlsPagePythonType] = []
        spatial_indices_by_page: Dict[int, STRtree] = {}
        tokens_by_page: Dict[int, List[PawlsTokenPythonType]] = {}
        token_indices_by_page: Dict[int, np.ndarray] = {}
        content_parts: List[str] = []
        
        tokens = self.process_document_text_boxes(doc)
        logger.info(f"Tokens: {tokens}")

        for page_num, page in doc.pages.items():
            logger.info(f"Processing page number {page_num}")

            # Get page size
            if page.size:
                width = page.size.width
                height = page.size.height
                logger.info(f"Page {page_num} dimensions: width={width}, height={height}")
            else:
                # Default dimensions if page size is not available
                width = 612.0
                height = 792.0
                logger.warning(f"Page size not found for page {page_num}, using defaults")

            # Convert PIL image to OpenCV image
            image_array = np.array(page.image.pil_image)
            image_cv = cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR)

            # Convert the image to grayscale
            gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)

            # Apply thresholding (if needed)
            thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
            inverted_image = 255 - thresh

            # Use pytesseract to extract words
            word_data = pytesseract.image_to_data(
                inverted_image,
                output_type=pytesseract.Output.DICT,
                config='--psm 6'
            )

            tokens: List[PawlsTokenPythonType] = []
            geometries: List[Any] = []
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

            # Convert lists to numpy arrays
            geometries_array = np.array(geometries, dtype=object)
            token_indices_array = np.array(token_indices)

            # Build spatial index for the page
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

    def process_document_text_boxes(self, doc: DoclingDocument) -> Dict[int, List[PawlsTokenPythonType]]:
        """Process all text items in a DoclingDocument to extract word-level bounding boxes."""
        from collections import defaultdict
        result: Dict[int, List[PawlsTokenPythonType]] = {}
        
        expected_tokens_per_page = defaultdict(int)
        for text_item in doc.texts:
            for prov in text_item.prov:
                expected_tokens_per_page[prov.page_no] += len(text_item.text.split())

        # Process each page
        for page_no, page_item in doc.pages.items():
            if not page_item.image:
                continue
            
            expected_tokens = expected_tokens_per_page[page_no]
            if expected_tokens == 0:
                continue
            
            # Get page image
            page_image = page_item.image.pil_image
            if not page_image:
                continue
            
            # Convert PIL to OpenCV format for this page
            cv_image = cv2.cvtColor(np.array(page_image), cv2.COLOR_RGB2BGR)
            
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
                        
                        # Convert to absolute page coordinates
                        word_box = {
                            "x": float(x_min + x_rel),
                            "y": float(y_min + y_rel),
                            "width": float(w_rel),
                            "height": float(h_rel)
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