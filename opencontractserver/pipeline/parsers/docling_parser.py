import io
import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Optional, Union

import numpy as np
import pdf2image
import pytesseract
from django.conf import settings
from django.core.files.storage import default_storage
from docling.datamodel.base_models import ConversionStatus, DocumentStream, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.transforms.chunker.hierarchical_chunker import HierarchicalChunker
from docling_core.types.doc import (
    DocItemLabel,
    DoclingDocument,
    SectionHeaderItem,
    TextItem,
)
from docling_core.types.doc.document import ListItem
from shapely.geometry import box
from shapely.strtree import STRtree

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
    OpenContractsRelationshipPythonType,
    OpenContractsSinglePageAnnotationType,
    PawlsPagePythonType,
    PawlsTokenPythonType,
)
from opencontractserver.utils.files import check_if_pdf_needs_ocr
from opencontractserver.utils.layout import reassign_annotation_hierarchy

logger = logging.getLogger(__name__)


def build_text_lookup(docling_document: DoclingDocument) -> dict[str, str]:
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
        if (
            isinstance(item_text, str)
            and item_text.strip()
            and isinstance(item_ref, str)
        ):
            text_lookup[item_text.strip()] = item_ref
    return text_lookup


def convert_docling_item_to_annotation(
    item: Union[TextItem, SectionHeaderItem, ListItem],
    spatial_indices_by_page: dict[int, STRtree],
    tokens_by_page: dict[int, list[PawlsTokenPythonType]],
    token_indices_by_page: dict[int, np.ndarray],
    page_dimensions: dict[
        int, tuple[float, float]
    ],  # Map of page_no to (width, height),
) -> Optional[OpenContractsAnnotationPythonType]:
    """Convert a document item to an annotation dictionary format.

    Args:
        item: A document item (TextItem, SectionHeaderItem, or ListItem)
        spatial_indices_by_page: Dictionary mapping page numbers to spatial indices
        tokens_by_page: Dictionary mapping page numbers to token lists
        token_indices_by_page: Dictionary mapping page numbers to token indices arrays
        page_dimensions: Dictionary mapping page numbers to (width, height) tuples

    Returns:
        An AnnotationType dictionary containing the item's information, or None if
        the item lacks required provenance data
    """
    if not (hasattr(item, "prov") and item.prov):
        return None

    first_prov = item.prov[0]
    if not first_prov.bbox:
        return None

    bbox = first_prov.bbox
    page_no = first_prov.page_no - 1  # Convert 1-indexed to 0-indexed
    item_text = getattr(item, "text", "")

    logger.info(f"Page dimensions: {page_dimensions}")

    # Get page height for coordinate transformation
    _, page_height = page_dimensions.get(page_no, (0, 0))
    if page_height == 0:
        logger.warning(f"No page dimensions found for page {page_no}")
        return None

    # Transform Y coordinates from PDF (bottom-left) to screen (top-left) coordinate system
    screen_bottom = page_height - bbox.b
    screen_top = page_height - bbox.t

    chunk_bbox = box(bbox.l, screen_top, bbox.r, screen_bottom)
    spatial_index = spatial_indices_by_page.get(page_no)
    tokens = tokens_by_page.get(page_no)
    token_indices_array = token_indices_by_page.get(page_no)

    if spatial_index is None or tokens is None or token_indices_array is None:
        logger.warning(
            f"No spatial index or tokens found for page {page_no}; skipping doc_item"
        )
        return None

    candidate_indices = spatial_index.query(chunk_bbox)
    candidate_geometries = spatial_index.geometries.take(candidate_indices)
    actual_indices = candidate_indices[
        [geom.intersects(chunk_bbox) for geom in candidate_geometries]
    ]
    token_indices = token_indices_array[actual_indices]

    token_ids = [
        {"pageIndex": page_no, "tokenIndex": int(idx)} for idx in sorted(token_indices)
    ]

    # Create the annotation_json structure
    annotation_json: dict[int, OpenContractsSinglePageAnnotationType] = {
        page_no: {
            "bounds": {
                "left": bbox.l,
                "top": screen_top,
                "right": bbox.r,
                "bottom": screen_bottom,
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
        "annotation_type": "TOKEN_LABEL",  # We are ONLY processing PDFs so this must be TOKEN_LABEL type
        "structural": True,
    }

    return annotation


class DoclingParser(BaseParser):
    """
    A parser that uses DoclingDocument objects (and optional OCR or PDF parsing)
    to produce annotations and relationships.
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
            raise FileNotFoundError(
                f"Docling models path '{artifacts_path}' does not exist."
            )

        # Log the contents of the models directory
        logger.info(f"Docling models directory contents: {os.listdir(artifacts_path)}")

        pipeline_options = PdfPipelineOptions(
            artifacts_path=artifacts_path,
            do_ocr=True,
            do_table_structure=True,
            generate_page_images=True,
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
        Reads a DoclingDocument, constructs annotation JSON for each chunk,
        assigns parent-child relationships (via parent_id), and also creates
        group relationships. Specifically, if multiple Docling chunks share the
        same heading, all the items in those chunks will be combined into a single
        relationship (with shared heading as the source, and all collected items
        as targets).

        Args:
            user_id (int): The ID of the user parsing the document.
            doc_id (int): The ID of the target Document in the database.
            **kwargs: Additional optional arguments (e.g. "force_ocr", "llm_enhanced_hierarchy", etc.)

        Returns:
            Optional[OpenContractDocExport]: A dictionary containing the doc metadata,
            annotations ("labelled_text"), and relationships (including grouped relationships).
        """
        logger.info(f"DoclingParser - Parsing doc {doc_id} for user {user_id}")

        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        force_ocr = kwargs.get("force_ocr", False)
        if force_ocr:
            logger.info(
                "Force OCR is enabled - this adds extra processing time and may not be necessary. "
                "We normally try to intelligently determine if OCR is needed."
            )

        roll_up_groups = kwargs.get("roll_up_groups", False)
        if roll_up_groups:
            logger.info(
                "Roll up groups is enabled - this will roll up groups of items that have the same "
                "parent_id into a single group. If you'd prefer smaller groups, set this to False."
            )

        # Read pdf bytes and create DocumentStream
        with default_storage.open(doc_path, "rb") as pdf_file:
            pdf_bytes = pdf_file.read()
            buf = BytesIO(pdf_bytes)
            doc_stream = DocumentStream(name=f"doc_{doc_id}.pdf", stream=buf)

        try:
            # Convert file via Docling using DocumentStream
            result = self.doc_converter.convert(doc_stream)
            if result.status != ConversionStatus.SUCCESS:
                raise Exception(f"Conversion failed: {result.errors}")

            flattened_heading_annot_id_to_children: dict[
                Union[str, int], list[Union[str, int]]
            ] = {}
            heading_annot_id_to_children: list[
                tuple[Union[str, int], list[Union[str, int]]]
            ] = []
            doc: DoclingDocument = result.document

            # 2) generate pawls/tokens/etc.
            (
                pawls_pages,
                spatial_indices_by_page,
                tokens_by_page,
                token_indices_by_page,
                page_dimensions,
                content,
            ) = self._generate_pawls_content(doc, pdf_bytes, force_ocr)

            # Run the hierarchical chunker
            chunker = HierarchicalChunker()
            chunks = list(chunker.chunk(dl_doc=doc))

            # 3) Build annotation JSON from doc items
            base_annotation_lookup = {}
            text_lookup = {}

            text_lookup = build_text_lookup(doc)
            logger.info(f"Text lookup: {text_lookup}")
            base_annotation_lookup = {
                text.self_ref: convert_docling_item_to_annotation(
                    text,
                    spatial_indices_by_page,
                    tokens_by_page,
                    token_indices_by_page,
                    page_dimensions,
                )
                for text in doc.texts
            }

            # Use Chunks to find and apply parent_ids (warning this will )
            for i, chunk in enumerate(chunks):

                logger.info(f"Chunk {i} has headings: {chunk.meta.headings}")

                # Print headers if they exist
                if chunk.meta.headings:
                    if len(chunk.meta.headings) > 1:
                        logger.warning(
                            f"Docling chunk {i} has multiple headings; this is not supported yet"
                        )
                    heading = chunk.meta.headings[0]
                    logger.info(f"Find heading: {heading}")
                    parent_ref = text_lookup.get(heading.strip())
                    logger.info(f"Found parent ref: {parent_ref}")

                    # Add parent_ref to heading_annot_id_to_children if it doesn't exist
                    if roll_up_groups:
                        if parent_ref not in flattened_heading_annot_id_to_children:
                            flattened_heading_annot_id_to_children[parent_ref] = []
                    else:
                        heading_annot_id_to_children.append((parent_ref, []))

                else:
                    parent_ref = None

                if hasattr(chunk.meta, "doc_items"):
                    logger.info(f"Number of doc_items: {len(chunk.meta.doc_items)}")

                    # Inspect each doc_item
                    accumulator = []
                    prev_parent_ref = parent_ref

                    for j, item in enumerate(chunk.meta.doc_items):

                        annotation = base_annotation_lookup.get(item.self_ref)
                        if annotation:

                            if prev_parent_ref != parent_ref:
                                if not roll_up_groups and len(accumulator) > 0:
                                    heading_annot_id_to_children.append(
                                        (prev_parent_ref, accumulator)
                                    )
                                accumulator = []
                                prev_parent_ref = parent_ref

                            annotation["parent_id"] = parent_ref

                            # Add the annotation id to the parent's children list
                            if roll_up_groups:
                                if parent_ref is not None:
                                    flattened_heading_annot_id_to_children[
                                        parent_ref
                                    ].append(annotation["id"])
                            else:
                                accumulator.append(annotation["id"])

                        else:
                            logger.error(
                                f"No annotation found in base_annotation_lookup for text item with ref {item.self_ref}"
                            )

                    if len(accumulator) > 0:
                        heading_annot_id_to_children.append(
                            (prev_parent_ref, accumulator)
                        )

            # 2) Build relationships from heading_annot_id_to_children
            relationships: list[OpenContractsRelationshipPythonType] = []
            rel_counter = 0
            # If we're rolling up the groups...
            if roll_up_groups:
                for (
                    heading_id,
                    child_ids,
                ) in flattened_heading_annot_id_to_children.items():
                    relationship_entry = {
                        "id": f"group-rel-{rel_counter}",
                        "relationshipLabel": "Docling Group Relationship",
                        "source_annotation_ids": [heading_id],
                        "target_annotation_ids": child_ids,
                        "structural": True,  # related to doc not corpus (underlying structure of document)
                    }
                    relationships.append(relationship_entry)
                    rel_counter += 1
            # Otherwise...
            else:
                for heading_id, child_ids in heading_annot_id_to_children:
                    relationship_entry = {
                        "id": f"group-rel-{rel_counter}",
                        "relationshipLabel": "Docling Group Relationship",
                        "source_annotation_ids": [heading_id],
                        "target_annotation_ids": child_ids,
                        "structural": True,  # related to doc not corpus (underlying structure of document)
                    }
                    relationships.append(relationship_entry)
                    rel_counter += 1

            # Create OpenContracts document structure
            open_contracts_data: OpenContractDocExport = {
                "title": self._extract_title(doc, Path(doc_path).stem),
                "content": content,
                "description": self._extract_description(
                    doc, self._extract_title(doc, Path(doc_path).stem)
                ),
                "pawls_file_content": pawls_pages,
                "page_count": len(pawls_pages),
                "doc_labels": [],
                "labelled_text": list(base_annotation_lookup.values()),
                "relationships": relationships,
            }
            #########################################################

            # IF LLM_ENHANCED_HIERARCHY is True, traverse the structure produced by Docling (which is
            # clean and has nicely separated sections BUT very poor
            # in terms of complex doc hierarchy) and use LLM to infer relationships between sections.
            # EXPERIMENTAL - NOT UPDATED TO PRODUCE GROUP RELATIONSHIPS
            if kwargs.get("llm_enhanced_hierarchy", False):
                logger.info(
                    "LLM-enhanced hierarchy enabled - adds processing time but improves hierarchy quality"
                )
                enriched_data = reassign_annotation_hierarchy(
                    open_contracts_data["labelled_text"]
                )
                open_contracts_data["labelled_text"] = enriched_data

            # print_labelled_text_hierarchy(open_contracts_data['labelled_text'], "labelled_text_hierarchy.txt")

            return open_contracts_data

        except Exception as e:
            logger.error(f"Docling parser failed: {e}")
            return None

        finally:
            if os.path.exists(doc_path):
                os.remove(doc_path)

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

    def _extract_description(self, doc: DoclingDocument, title: str) -> str:
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
        self, doc: DoclingDocument, doc_bytes: bytes, force_ocr: bool = False
    ) -> tuple[
        list[PawlsPagePythonType],
        dict[int, STRtree],
        dict[int, list[PawlsTokenPythonType]],
        dict[int, np.ndarray],
        dict[int, tuple[float, float]],  # Add page_dimensions to return tuple
        str,
    ]:
        """
        Convert Docling document content to PAWLS format, build spatial index for tokens,
        and accumulate the document content.

        This method checks if the PDF requires OCR. If not, it uses pdfplumber to extract
            text and token bounding boxes.
        If OCR is required, it uses pdf2image and pytesseract to extract text and tokens
            from images.
        In both cases, it constructs the necessary data structures for PAWLS and adjusts
            coordinates to match the source document.

        Args:
            doc (DoclingDocument): The Docling document instance.
            doc_bytes (bytes): Bytes of the PDF document.

        Returns:
            Tuple containing:
                - List[PawlsPagePythonType]: List of PAWLS page objects with tokens and page information.
                - Dict[int, STRtree]: Mapping from page indices to their corresponding spatial
                  R-tree of token geometries.
                - Dict[int, List[PawlsTokenPythonType]]: Mapping from page indices to lists of tokens.
                - Dict[int, np.ndarray]: Mapping from page indices to arrays of token indices.
                - str: The full content of the document, constructed from the tokens.
        """
        logger.info("Generating PAWLS content")

        pawls_pages: list[PawlsPagePythonType] = []
        spatial_indices_by_page: dict[int, STRtree] = {}
        tokens_by_page: dict[int, list[PawlsTokenPythonType]] = {}
        token_indices_by_page: dict[int, np.ndarray] = {}
        page_dimensions: dict[int, tuple[float, float]] = {}
        content_parts: list[str] = []

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
                        logger.info(
                            f"Page dimensions from Docling: width={width}, height={height}"
                        )
                    else:
                        # Use page size from pdfplumber
                        width = page.width
                        height = page.height
                        logger.warning(
                            "No page size in Docling document; using pdfplumber page "
                            f"size: width={width}, height={height}"
                        )

                    page_dimensions[page_num - 1] = (width, height)  # Store dimensions

                    # Calculate scaling factors to adjust pdfplumber coordinates
                    plumber_width = page.width
                    plumber_height = page.height
                    if plumber_width != width or plumber_height != height:
                        scale_x = width / plumber_width
                        scale_y = height / plumber_height
                        logger.info(
                            f"Scaling pdfplumber coordinates by factors scale_x={scale_x}, scale_y={scale_y}"
                        )
                    else:
                        scale_x = 1.0
                        scale_y = 1.0

                    tokens: list[PawlsTokenPythonType] = []
                    geometries: list[box] = []
                    token_indices: list[int] = []
                    page_content_parts: list[str] = []

                    # Extract words with bounding boxes
                    words = page.extract_words()
                    for word in words:
                        x0 = float(word["x0"]) * scale_x
                        y0 = float(word["top"]) * scale_y
                        x1 = float(word["x1"]) * scale_x
                        y1 = float(word["bottom"]) * scale_y
                        text = word["text"]

                        w = x1 - x0
                        h = y1 - y0
                        y = y0  # Use y0 directly without flipping

                        token: PawlsTokenPythonType = {
                            "x": x0,
                            "y": y,
                            "width": w,
                            "height": h,
                            "text": text,
                        }

                        tokens.append(token)
                        page_content_parts.append(text)
                        logger.debug(f"Added token on page {page_num}: {token}")

                        # Create geometry for spatial index
                        token_bbox = box(x0, y, x0 + w, y + h)
                        geometries.append(token_bbox)
                        token_indices.append(len(tokens) - 1)

                    # Append page content to the overall content
                    content_parts.append(" ".join(page_content_parts))

                    # Build spatial index for the page
                    geometries_array = np.array(geometries, dtype=object)
                    token_indices_array = np.array(token_indices)

                    spatial_index = STRtree(geometries_array)
                    spatial_indices_by_page[page_num - 1] = spatial_index
                    tokens_by_page[page_num - 1] = tokens
                    token_indices_by_page[page_num - 1] = token_indices_array

                    # Create PawlsPagePythonType
                    pawls_page: PawlsPagePythonType = {
                        "page": {
                            "width": width * scale_x,
                            "height": height * scale_y,
                            "index": page_num,
                        },
                        "tokens": tokens,
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
                    logger.info(
                        f"Page dimensions from Docling: width={width}, height={height}"
                    )
                else:
                    # Use image size as fallback
                    width, height = page_image.size
                    logger.warning(
                        f"No page size in Docling document; using image size: width={width}, height={height}"
                    )

                page_dimensions[page_num - 1] = (width, height)  # Store dimensions

                custom_config = r"--oem 3 --psm 3"
                word_data = pytesseract.image_to_data(
                    page_image,
                    output_type=pytesseract.Output.DICT,
                    config=custom_config,
                )

                tokens: list[PawlsTokenPythonType] = []
                geometries: list[box] = []
                token_indices: list[int] = []
                page_content_parts: list[str] = []

                n_boxes = len(word_data["text"])
                for i in range(n_boxes):
                    word_text = word_data["text"][i]
                    conf = int(word_data["conf"][i])

                    # Skip empty or low-confidence words
                    if conf > 0 and word_text.strip():
                        x = float(word_data["left"][i])
                        y = float(word_data["top"][i])
                        w = float(word_data["width"][i])
                        h = float(word_data["height"][i])

                        # Adjust coordinates to match the page size
                        img_width, img_height = page_image.size
                        scale_x = width / img_width
                        scale_y = height / img_height

                        x *= scale_x
                        y *= scale_y
                        w *= scale_x
                        h *= scale_y

                        y = y  # Use y directly without flipping

                        token: PawlsTokenPythonType = {
                            "x": x,
                            "y": y,
                            "width": w,
                            "height": h,
                            "text": word_text,
                        }

                        tokens.append(token)
                        page_content_parts.append(word_text)
                        logger.debug(f"Added token on page {page_num}: {token}")

                        # Create geometry for spatial index
                        token_bbox = box(x, y, x + w, y + h)
                        geometries.append(token_bbox)
                        token_indices.append(len(tokens) - 1)

                # Append page content to the overall content
                content_parts.append(" ".join(page_content_parts))

                # Build spatial index for the page
                geometries_array = np.array(geometries, dtype=object)
                token_indices_array = np.array(token_indices)

                spatial_index = STRtree(geometries_array)
                spatial_indices_by_page[page_num] = spatial_index
                tokens_by_page[page_num] = tokens
                token_indices_by_page[page_num] = token_indices_array

                # Create PawlsPagePythonType
                pawls_page: PawlsPagePythonType = {
                    "page": {
                        "width": width,
                        "height": height,
                        "index": page_num,
                    },
                    "tokens": tokens,
                }

                pawls_pages.append(pawls_page)
                logger.info(f"PAWLS content for page {page_num} added")

        # Combine content parts into full content
        content = "\n".join(content_parts)

        return (
            pawls_pages,
            spatial_indices_by_page,
            tokens_by_page,
            token_indices_by_page,
            page_dimensions,
            content,
        )
