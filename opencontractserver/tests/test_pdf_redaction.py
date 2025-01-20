"""Tests for PDF redaction functionality."""

import io
import logging
import json
import os
from typing import List, Tuple
import unittest
import zipfile
from unittest import TestCase

from PyPDF2 import PdfReader

from opencontractserver.pipeline.utils import run_post_processors
from opencontractserver.tests.fixtures import SAMPLE_PAWLS_FILE_ONE_PATH, SAMPLE_PDF_FILE_ONE_PATH
from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType, OpenContractsSinglePageAnnotationType, PawlsPagePythonType

logger = logging.getLogger(__name__)


def _generate_test_annotations_from_strings(
    redacts: List[Tuple[str, ...]], pawls_data: List[PawlsPagePythonType]
) -> List[OpenContractsSinglePageAnnotationType]:
    """
    Generate test annotations from a list of strings.
    """
    all_target_tokens = []
    first_page_tokens = pawls_data[0]["tokens"]

    for redact_tuple in redacts:
        i = 0
        while i < len(first_page_tokens):
            if redact_tuple[0].lower() in first_page_tokens[i]["text"].lower():
                # Potential match found, check subsequent tokens
                match_found = True
                for j, expected_text in enumerate(redact_tuple[1:], 1):
                    if (
                        i + j >= len(first_page_tokens)
                        or expected_text.lower() not in first_page_tokens[i + j]["text"].lower()
                    ):
                        match_found = False
                        break

                if match_found:
                    # Add all token indices that form this match
                    matched_indices = list(range(i, i + len(redact_tuple)))
                    all_target_tokens.append(
                        {
                            "indices": matched_indices,
                            "bounds": {
                                "left": min(first_page_tokens[idx]["x"] for idx in matched_indices),
                                "right": max(
                                    first_page_tokens[idx]["x"] + first_page_tokens[idx]["width"]
                                    for idx in matched_indices
                                ),
                                "top": min(first_page_tokens[idx]["y"] for idx in matched_indices),
                                "bottom": max(
                                    first_page_tokens[idx]["y"] + first_page_tokens[idx]["height"]
                                    for idx in matched_indices
                                ),
                            },
                            "text": " ".join(redact_tuple),
                        }
                    )
            i += 1

    assert all_target_tokens, "Could not find any of the specified token sequences for redaction."

    # Create annotations for each matched sequence
    test_annotations: List[OpenContractsSinglePageAnnotationType] = [
        {
            "bounds": match["bounds"],
            "tokensJsons": [{"pageIndex": 0, "tokenIndex": idx} for idx in match["indices"]],
            "rawText": match["text"],
        }
        for match in all_target_tokens
    ]

    # We'll wrap our single page annotation list in another list
    # because these are "page_annotations," one list per page
    page_annotations = [test_annotations] + [[] for _ in pawls_data[1:]]
    return page_annotations



class TestPDFRedaction(TestCase):
    """Test cases for PDF redaction functionality."""

    def setUp(self):
        """Set up test case with sample files."""
        # Load PAWLS data
        try:
            with open(SAMPLE_PAWLS_FILE_ONE_PATH, 'r') as f:
                self.pawls_data = json.load(f)
        except Exception as e:
            logger.error(f"Error loading PAWLS data: {str(e)}")
            raise

        # Load sample PDF
        try:
            with open(SAMPLE_PDF_FILE_ONE_PATH, 'rb') as f:
                self.pdf_bytes = f.read()
        except Exception as e:
            logger.error(f"Error loading PDF: {str(e)}")
            raise

    def test_pdf_redactor_with_sample_files(self):
        """
        Test PDFRedactor post-processor using sample PDF and PAWLS files.
        Creates three test annotations and verifies they are processed without error.
        """
        
        # Create three test annotations at different locations
        redacts = [
            ("Exhibit", "10.1"),
            ("Aucta", "Pharmaceuticals"),
            ("Eton", "Pharmaceuticals"),
            ("Eton",),
            ("Aucta",),
        ]

        # Find all matching token sequences
        test_annotations = _generate_test_annotations_from_strings(redacts, self.pawls_data)

        # Create test export data
        filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {
                filename: {
                    "pawls_pages": self.pawls_data,
                    "annotations": test_annotations
                }
            },
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Create a zip file containing the PDF
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(filename, self.pdf_bytes)
        
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        try:
            # Run the PDFRedactor
            processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
            modified_zip_bytes, modified_export_data = run_post_processors(
                processor_paths,
                zip_bytes,
                export_data
            )
            
            # Save locally for debugging
            # with open("debug_zip.zip", "wb") as f:
            #     f.write(modified_zip_bytes)
            # logger.info(f"Saved locally for debugging: debug_1_zip.zip")

            logger.info("Proceeding with test...")
            # Verify the output
            self.assertIsNotNone(modified_zip_bytes)
            self.assertGreater(len(modified_zip_bytes), 0)

            # Verify we can read the processed PDF
            with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as zip_file:
                # Check the PDF is still there
                self.assertIn(filename, zip_file.namelist())
                
                # Try to read the PDF to verify it's valid
                processed_pdf_bytes = zip_file.read(filename)
                self.assertGreater(len(processed_pdf_bytes), 0)
                
                # Verify it's a valid PDF by trying to read it
                pdf_io = io.BytesIO(processed_pdf_bytes)
                reader = PdfReader(pdf_io)
                self.assertGreater(len(reader.pages), 0)
                
                extracted_text = reader.pages[0].extract_text()
                extracted_text = extracted_text.upper()
                        
                 # Check each redaction tuple
                for redact_tuple in redacts:
                    redact_text = " ".join(redact_tuple).upper()
                    self.assertNotIn(
                        redact_text,
                        extracted_text,
                        f"Redacted text '{redact_text}' was still found in the PDF text layer.",
                    )
                
                
        except Exception as e:
            logger.error(f"Error in PDF redaction test: {str(e)}")
            raise

    def test_pdf_redactor_with_no_annotations(self):
        """Test that PDFRedactor correctly handles PDFs with no annotations."""
        # Create test export data with no annotations
        filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {
                filename: {
                    "pawls_pages": [],  # Empty PAWLS pages
                    "annotations": []
                }
            },
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Create a zip file containing the PDF
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(filename, self.pdf_bytes)
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        try:
            # Run the PDFRedactor
            processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
            modified_zip_bytes, modified_export_data = run_post_processors(
                processor_paths,
                zip_bytes,
                export_data
            )

            # Verify the output
            with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as zip_file:
                processed_pdf_bytes = zip_file.read(filename)
                
                # Instead of comparing bytes directly, compare PDF structure
                original_pdf = PdfReader(io.BytesIO(self.pdf_bytes))
                processed_pdf = PdfReader(io.BytesIO(processed_pdf_bytes))
                
                # Check that basic structure is preserved
                self.assertEqual(len(original_pdf.pages), len(processed_pdf.pages))
                
                # Check that text content is preserved (since there were no annotations)
                for i in range(len(original_pdf.pages)):
                    original_text = original_pdf.pages[i].extract_text()
                    processed_text = processed_pdf.pages[i].extract_text()
                    self.assertEqual(original_text, processed_text)
                
        except Exception as e:
            logger.error(f"Error in no annotations test: {str(e)}")
            raise

    def test_pdf_redactor_with_non_pdf_files(self):
        """Test that PDFRedactor correctly handles non-PDF files in the export."""
        # Create a zip with both PDF and non-PDF files
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            # Add the PDF
            pdf_filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
            zip_file.writestr(pdf_filename, self.pdf_bytes)
            
            # Add a text file
            text_content = b"This is a test text file"
            zip_file.writestr("test.txt", text_content)

        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        # Create export data with no annotations
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {},
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        try:
            # Run the PDFRedactor
            processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
            modified_zip_bytes, modified_export_data = run_post_processors(
                processor_paths,
                zip_bytes,
                export_data
            )

            # Verify the output
            with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as zip_file:
                # Check both files are present
                self.assertIn(pdf_filename, zip_file.namelist())
                self.assertIn("test.txt", zip_file.namelist())
                
                # Verify text file is unchanged
                processed_text = zip_file.read("test.txt")
                self.assertEqual(processed_text, text_content)
        except Exception as e:
            logger.error(f"Error in non-PDF files test: {str(e)}")
            raise

    def test_pdf_redactor_with_ocr_verification(self) -> None:
        """
        Revamped test for searching tokens in page 0 for "AUCTA" and "Pharmaceuticals" 
        (ignoring case) and applying redactions. Finally, verifies that "Aucta Pharmaceuticals"
        does not appear in (1) the image layer extracted via OCR, or (2) the underlying PDF 
        text layer itself.
        """
        from pdf2image import convert_from_bytes
        import pytesseract
        from PyPDF2 import PdfReader

        # Search FIRST page tokens for consecutive "Aucta" and "Pharmaceuticals" (ignoring case).
        page_tokens = self.pawls_data[0]["tokens"]
        target_token_pairs = []

        for i in range(len(page_tokens) - 1):
            current_text_lower = page_tokens[i]["text"].lower()
            next_text_lower = page_tokens[i+1]["text"].lower()
            if "aucta" in current_text_lower and "pharmaceuticals" in next_text_lower:
                target_token_pairs.append((i, i+1))

        if not target_token_pairs:
            self.fail("Could not find consecutive tokens 'Aucta' and 'Pharmaceuticals' in the sample PDF data.")

        # Build a single annotation for each discovered token pair.
        test_annotations = []
        for (idx1, idx2) in target_token_pairs:
            token1 = page_tokens[idx1]
            token2 = page_tokens[idx2]

            x_left = min(token1["x"], token2["x"])
            y_top = min(token1["y"], token2["y"])
            x_right = max(token1["x"] + token1["width"], token2["x"] + token2["width"])
            y_bottom = max(token1["y"] + token1["height"], token2["y"] + token2["height"])

            annotation_entry = {
                "bounds": {
                    "left": x_left,
                    "right": x_right,
                    "top": y_top,
                    "bottom": y_bottom,
                },
                "tokensJsons": [
                    {"pageIndex": 0, "tokenIndex": idx1},
                    {"pageIndex": 0, "tokenIndex": idx2},
                ],
                "rawText": f"{token1['text']} {token2['text']}",
            }
            logger.info(f"💕Target Annotation😍: {annotation_entry}")
            test_annotations.append(annotation_entry)

        # Create test export data (similar to the original approach).
        filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {
                filename: {
                    "pawls_pages": self.pawls_data,
                    "annotations": test_annotations
                }
            },
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Package our PDF bytes into a zip.
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(filename, self.pdf_bytes)
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        # Run the PDFRedactor post-processor.
        processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
        modified_zip_bytes, _ = run_post_processors(
            processor_paths,
            zip_bytes,
            export_data
        )

        # Save locally for debugging
        # with open("debug_zip_aucta.zip", "wb") as f:
        #     f.write(modified_zip_bytes)
        # logger.info(f"Saved locally for debugging: debug_zip_aucta.zip")

        self.assertIsNotNone(modified_zip_bytes)
        self.assertGreater(len(modified_zip_bytes), 0, "Modified zip is unexpectedly empty.")

        # Extract processed PDF from the modified zip.
        with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as zip_file:
            processed_pdf_bytes = zip_file.read(filename)

        # -------------------------------------------
        # 1) Check via OCR to ensure text is removed.
        # -------------------------------------------
        pages = convert_from_bytes(processed_pdf_bytes)
        custom_config = r"--oem 3 --psm 3"
        all_ocr_text = []
        
        page_image = pages[0]
        data = pytesseract.image_to_data(
            page_image,
            output_type=pytesseract.Output.DICT,
            config=custom_config,
        )
        for i in range(len(data["text"])):
            conf = int(data["conf"][i])
            text_val = data["text"][i]
            if conf > 0 and text_val.strip():
                all_ocr_text.append(text_val)

        combined_ocr = " ".join(all_ocr_text).upper()
        self.assertNotIn("AUCTA PHARMACEUTICALS", combined_ocr, 
                         msg="Redacted text 'Aucta Pharmaceuticals' was still detected by OCR.")

        # -------------------------------------------------
        # 2) Check text layer extraction (PDF structure).
        # -------------------------------------------------
        pdf_io = io.BytesIO(processed_pdf_bytes)
        reader = PdfReader(pdf_io)

        # Concatenate text from all pages.
        extracted_text_pages = []
        page_text = reader.pages[0].extract_text()
        # In case extract_text() returns None, handle gracefully.
        if page_text:
            extracted_text_pages.append(page_text.upper())

        combined_pdf_text_layer = " ".join(extracted_text_pages)

        # Confirm that "Aucta" or "Pharmaceuticals" no longer appear in the PDF text layer.
        self.assertNotIn("AUCTA PHARMACEUTICALS", combined_pdf_text_layer,
                         msg="Redacted token 'Aucta' still present in PDF text layer.")


    def test_pdf_redactor_with_specific_tokens(self) -> None:
        """
        Test the PDFRedactor post-processor by redacting specific tokens
        based on actual PAWLS data (token bounding boxes). This test then
        performs OCR on the processed PDF to ensure the targeted text is
        no longer detectable.

        Now uses pytesseract (to match docling_parser approach).
        """
        from pdf2image import convert_from_bytes
        import pytesseract
        import numpy as np

        # Debug: Print all available tokens to find the correct ones
        logger.info("\nAvailable tokens on first page:")
        for i, token in enumerate(self.pawls_data[0]["tokens"]):
            logger.info(f"Token {i}: '{token['text']}' at (x={token['x']:.2f}, y={token['y']:.2f}, w={token['width']:.2f}, h={token['height']:.2f})")

        # Find the tokens for "June 12, 2019" by looking at the coordinates from the image
        target_tokens = []
        for i, token in enumerate(self.pawls_data[0]["tokens"]):
            # Look for tokens around the coordinates we want (484-534, 92-98)
            if (480 <= token["x"] <= 535 and 90 <= token["y"] <= 100 and 
                token["text"] in ["June", "12,", "2019"]):
                target_tokens.append(i)
                logger.info(f"Found target token: {token['text']} at index {i}")

        if not target_tokens:
            self.fail("Could not find the target tokens for 'June 12, 2019'")

        # We will redact the sequence "June 12, 2019" from the sample PDF.
        test_annotations = [
            {
                "bounds": {
                    # Use exact coordinates from the tokens
                    "left": 484.13,  # x of "June"
                    "right": 529.49,  # x + width of "2019" (513.65 + 15.84)
                    "top": 92.16,    # min y of the tokens
                    "bottom": 98.28  # max y + height (92.52 + 5.76)
                },
                "tokensJsons": [
                    {"pageIndex": 0, "tokenIndex": 53},  # June
                    {"pageIndex": 0, "tokenIndex": 54},  # 12,
                    {"pageIndex": 0, "tokenIndex": 55}   # 2019
                ],
                "rawText": "June 12, 2019"
            }
        ]

        # Create an export data object that includes these annotations.
        filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {
                filename: {
                    "pawls_pages": self.pawls_data,
                    "annotations": test_annotations
                }
            },
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Create a zip file containing the original PDF bytes
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(filename, self.pdf_bytes)
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        # Run the PDFRedactor to apply our specified redactions
        processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
        modified_zip_bytes, _ = run_post_processors(
            processor_paths,
            zip_bytes,
            export_data
        )
        self.assertIsNotNone(modified_zip_bytes)
        self.assertGreater(len(modified_zip_bytes), 0)
        
         # Save locally for debugging
        # with open("debug_zip_date.zip", "wb") as f:
        #     f.write(modified_zip_bytes)
        # logger.info(f"Saved locally for debugging: debug_zip.zip")

        # Extract the processed PDF from the updated zip
        with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as updated_zip:
            processed_pdf_bytes = updated_zip.read(filename)
            self.assertGreater(len(processed_pdf_bytes), 0, "Processed PDF is unexpectedly empty.")

        # Render the processed PDF to images for OCR
        pages = convert_from_bytes(processed_pdf_bytes)

        # Perform OCR using pytesseract
        custom_config = r"--oem 3 --psm 3"
        all_ocr_text = []

        for page_image in pages:
            np_image = np.array(page_image)
            data = pytesseract.image_to_data(
                page_image,
                output_type=pytesseract.Output.DICT,
                config=custom_config,
            )
            n_boxes = len(data["text"])
            for i in range(n_boxes):
                conf = int(data["conf"][i])
                raw_text = data["text"][i]
                if conf > 0 and raw_text.strip():
                    all_ocr_text.append(raw_text)

        combined_text = " ".join(all_ocr_text).upper()

        # Verify that the targeted text is no longer present
        self.assertNotIn("JUNE 12, 2019", combined_text, msg="Redacted text 'June 12, 2019' was detected by OCR.")

    def test_pdf_redactor_text_replaced_with_redacted(self):
        """
        Verifies that specifying a bounding box in which text is found
        results in that text being replaced by "[REDACTED]" in the output
        PDF's text stream (non-nuclear path).
        """

        # For simplicity, let's just place a bounding box around
        # the very first token from page 0 in the pawls_data
        # (We only need the bounding box big enough to match a known token).
        import json
        pawls_list = json.loads(self.pawls_data)
        if not pawls_list:
            self.fail("PAWLS data is empty, cannot proceed.")
        if not pawls_list[0]["tokens"]:
            self.fail("No tokens found in page 0, cannot proceed.")

        first_token = pawls_list[0]["tokens"][0]
        token_text = first_token["text"]
        # Make bounding box around token:
        left = first_token["x"]
        top = first_token["y"]
        right = left + first_token["width"]
        bottom = top + first_token["height"]

        annotation = {
            "bounds": {
                "left": left,
                "right": right,
                "top": top,
                "bottom": bottom
            },
            "tokensJsons": [
                {"pageIndex": 0, "tokenIndex": 0}
            ],
            "rawText": token_text,
        }

        # Build export data with this single annotation
        filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
        export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {
                filename: {
                    "pawls_pages": pawls_list,
                    "annotations": [annotation]
                }
            },
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Create a ZIP with our sample PDF
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr(filename, self.pdf_bytes)
        zip_buffer.seek(0)
        zip_bytes = zip_buffer.getvalue()

        # Run the non-nuclear redactor
        processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
        modified_zip_bytes, _ = run_post_processors(
            processor_paths,
            zip_bytes,
            export_data
        )

        # Grab the processed PDF
        with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), "r") as updated_zip:
            processed_pdf_bytes = updated_zip.read(filename)

        self.assertGreater(len(processed_pdf_bytes), 0, "Processed PDF is unexpectedly empty.")

        # Extract text from processed PDF to confirm token is replaced by "[REDACTED]"
        reader = PdfReader(io.BytesIO(processed_pdf_bytes))
        self.assertGreater(len(reader.pages), 0, "No pages found in processed PDF.")

        output_text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                output_text += page_text

        # Check that the original token is gone, replaced by "[REDACTED]"
        self.assertNotIn(token_text, output_text, "Original token text was not removed.")
        self.assertIn("[REDACTED]", output_text, "Expected '[REDACTED]' placeholder was not found.")

        logger.error(f"output_text: {output_text}")
        raise ValueError("You muuussst now travel to see the 💀 king!")
    

        # Verify that there's still some other text in the PDF
        # (we pick a snippet we expect from the sample PDF; it might vary)
        # "Agreement" is often in sample PDFs, or use partial text from second token if known
        self.assertIn("Agreement", output_text, "Expected unredacted text was missing.")

# class TestPDFRedactionNuclear(unittest.TestCase):
#     """
#     Test case to verify the nuclear redaction approach actually removes
#     targeted 'Aucta Pharmaceuticals' text from both the OCR layer 
#     and the PDF text layer, but still retains other text.
#     """

#     @classmethod
#     def setUpClass(cls):
#         """
#         Load the sample PDF and parse pawls data, if available.
#         """
#         # Load sample PDF
#         with open(SAMPLE_PDF_FILE_ONE_PATH, "rb") as f:
#             cls.pdf_bytes = f.read()

#         # Attempt to load the Pawls data (like test_pdf_redactor_with_ocr_verification).
#         # We assume 'self.pawls_data' is set in the same way as other tests do. 
#         # If not, adapt as needed.
#         from opencontractserver.tests.test_pdf_redaction import TestPDFRedaction
#         # We read from an existing test's setUp if it sets pawls_data
#         # or replicate that logic here manually:
#         # e.g., path to the pawls JSON: SAMPLE_PAWLS_FILE_ONE_PATH
#         # but for demonstration, let's do a minimal approach if needed.
#         # We'll rely on an existing fixture or fallback:
#         try:
#             # Create a dummy instance to leverage that test's setUp
#             temp_test = TestPDFRedaction()
#             temp_test.setUp()
#             cls.pawls_data = temp_test.pawls_data
#         except Exception as e:
#             logger.warning("Could not load pawls_data from other test. Pawls data might be missing.")
#             cls.pawls_data = []

#     def test_pdf_redactor_with_nuclear_ocr_verification(self):
#         """
#         Similar to test_pdf_redactor_with_ocr_verification, but forces nuclear=True
#         to ensure we fully flatten the PDF and eliminate the original text.
#         We still check that 'Aucta Pharmaceuticals' is removed, and confirm 
#         other text remains once re-OCR'd.
#         """
        
#         from pdf2image import convert_from_bytes
#         import pytesseract

#         # Make sure we have at least one page of tokens
#         if not self.pawls_data or not self.pawls_data[0].get("tokens"):
#             self.skipTest("No token data available, cannot run nuclear test.")
        
#         # Identify consecutive tokens "Aucta" / "Pharmaceuticals"
#         page_tokens = self.pawls_data[0]["tokens"]
#         target_token_pairs = []
#         for i in range(len(page_tokens) - 1):
#             t1 = page_tokens[i]["text"].lower()
#             t2 = page_tokens[i+1]["text"].lower()
#             if "aucta" in t1 and "pharmaceuticals" in t2:
#                 target_token_pairs.append((i, i+1))
        
#         if not target_token_pairs:
#             self.fail("Could not find consecutive tokens 'Aucta'/'Pharmaceuticals' for nuclear test.")

#         # Build bounding-box annotations
#         test_annotations = []
#         for (idx1, idx2) in target_token_pairs:
#             token1 = page_tokens[idx1]
#             token2 = page_tokens[idx2]

#             x_left = min(token1["x"], token2["x"])
#             y_top = min(token1["y"], token2["y"])
#             x_right = max(token1["x"] + token1["width"], token2["x"] + token2["width"])
#             y_bottom = max(token1["y"] + token1["height"], token2["y"] + token2["height"])

#             annotation_entry = {
#                 "bounds": {
#                     "left": x_left,
#                     "right": x_right,
#                     "top": y_top,
#                     "bottom": y_bottom,
#                 },
#                 "tokensJsons": [
#                     {"pageIndex": 0, "tokenIndex": idx1},
#                     {"pageIndex": 0, "tokenIndex": idx2},
#                 ],
#                 "rawText": f"{token1['text']} {token2['text']}",
#             }
#             test_annotations.append(annotation_entry)

#         # Build export_data
#         filename = os.path.basename(str(SAMPLE_PDF_FILE_ONE_PATH))
#         export_data: OpenContractsExportDataJsonPythonType = {
#             "annotated_docs": {
#                 filename: {
#                     "pawls_pages": self.pawls_data,
#                     "annotations": test_annotations
#                 }
#             },
#             "corpus": {
#                 "title": "Test Corpus",
#                 "description": "Test Description",
#                 "icon": None,
#             },
#             "label_set": {
#                 "title": "Test Label Set",
#                 "description": "Test Description",
#                 "icon": None,
#             },
#             "doc_labels": {},
#             "text_labels": {},
#         }

#         # Package PDF in a zip
#         zip_buffer = io.BytesIO()
#         with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
#             zf.writestr(filename, self.pdf_bytes)
#         zip_buffer.seek(0)
#         zip_bytes = zip_buffer.getvalue()

#         # Force nuclear redaction
#         processor_paths = ["opencontractserver.pipeline.post_processors.pdf_redactor.PDFRedactor"]
#         modified_zip_bytes, _ = run_post_processors(
#             processor_paths,
#             zip_bytes,
#             export_data,
#             processor_kwargs={"nuclear": True} # crucial!
#         )

#         self.assertIsNotNone(modified_zip_bytes)
#         self.assertGreater(len(modified_zip_bytes), 0, "Nuclear PDF output is empty!")

#         # Extract newly produced PDF
#         with zipfile.ZipFile(io.BytesIO(modified_zip_bytes), 'r') as zf:
#             processed_pdf_bytes = zf.read(filename)

#         # OCR the flattened PDF to confirm 'Aucta Pharmaceuticals' is gone
#         pages = convert_from_bytes(processed_pdf_bytes)
#         self.assertGreater(len(pages), 0, "No pages found in nuclear output PDF.")

#         page_image = pages[0]
#         data = pytesseract.image_to_data(page_image, output_type=pytesseract.Output.DICT)
#         all_ocr_text = []
#         for i in range(len(data["text"])):
#             conf = int(data["conf"][i])
#             if conf > 0:  # typically -1 means no confidence
#                 extracted_item = data["text"][i].strip()
#                 if extracted_item:
#                     all_ocr_text.append(extracted_item)

#         combined_ocr = " ".join(all_ocr_text).upper()
#         self.assertNotIn("AUCTA PHARMACEUTICALS", combined_ocr,
#                          msg="Redacted tokens found in new OCR text layer after nuclear approach.")

#         # Confirm there's still some text (the PDF has content beyond "Aucta Pharmaceuticals")
#         # For instance, if the PDF has "Agreement" or something similar, we check for it:
#         # This might vary based on your test PDF content. Adjust as appropriate:
#         self.assertTrue(len(combined_ocr) > 20, "Unexpectedly little text in the new OCR output.")
        
#         # Also check the PDF text layer via PyPDF2 to ensure original text is gone
#         pdf_reader = PdfReader(io.BytesIO(processed_pdf_bytes))
#         self.assertGreater(len(pdf_reader.pages), 0, "No pages in nuclear PDF?")

#         text_layer = ""
#         page_text = pdf_reader.pages[0].extract_text() or ""
#         text_layer += page_text.upper()

#         # "AUCTA" and "PHARMACEUTICALS" should not appear in the re-OCR'd text layer
#         self.assertNotIn("AUCTA PHARMACEUTICALS", text_layer,
#                          msg="Redacted text still present in PDF text extraction after nuclear approach.")

#         # We confirm there's some text in the PDF layer (Tesseract's PDF) 
#         # but it's bound to be different from the original, as it's new OCR.
#         # For example, we might expect at least some string or character data:
#         self.assertTrue(len(text_layer) > 0, "No text found in PDF text layer after nuclear approach.")

#         logger.info("Nuclear test for 'Aucta Pharmaceuticals' removal passed successfully.")
