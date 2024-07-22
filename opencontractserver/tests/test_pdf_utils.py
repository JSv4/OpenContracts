import io
import os
import tempfile

from django.test import TestCase
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from unittest.mock import patch, MagicMock

from opencontractserver.tests.fixtures import NLM_INGESTOR_SAMPLE_PDF, NLM_INGESTOR_SAMPLE_PDF_NEEDS_OCR
from opencontractserver.utils.pdf import (
    check_if_pdf_needs_ocr,
    base_64_encode_bytes,
    convert_hex_to_rgb_tuple,
    createHighlight,
    split_pdf_into_images,
)

class PDFUtilsTestCase(TestCase):
    def setUp(self):
        # Create a sample PDF file for testing
        self.sample_pdf_content = NLM_INGESTOR_SAMPLE_PDF.read_bytes()
        self.need_ocr_pdf_content = NLM_INGESTOR_SAMPLE_PDF_NEEDS_OCR.read_bytes()

    def test_check_if_pdf_needs_ocr_with_text(self):
        needs_ocr = check_if_pdf_needs_ocr(io.BytesIO(self.sample_pdf_content))
        self.assertFalse(needs_ocr)

    def test_check_if_pdf_needs_ocr_without_text(self):
        # Create a PDF without extractable text
        needs_ocr = check_if_pdf_needs_ocr(io.BytesIO(self.need_ocr_pdf_content))
        self.assertTrue(needs_ocr)

    def test_base_64_encode_bytes(self):
        test_bytes = b"Hello, World!"
        encoded = base_64_encode_bytes(test_bytes)
        self.assertEqual(encoded, "SGVsbG8sIFdvcmxkIQ==")

    def test_convert_hex_to_rgb_tuple(self):
        hex_color = "FF8000"
        rgb_tuple = convert_hex_to_rgb_tuple(hex_color)
        self.assertEqual(rgb_tuple, (255, 128, 0))

    def test_create_highlight(self):
        highlight = createHighlight(
            x1=10, y1=20, x2=30, y2=40,
            meta={"author": "Test Author", "contents": "Test Contents"},
            color=(1.0, 0.5, 0.0)
        )
        self.assertEqual(highlight["/Type"], "/Annot")
        self.assertEqual(highlight["/Subtype"], "/Highlight")
        self.assertEqual(highlight["/T"], "Test Author")
        self.assertEqual(highlight["/Contents"], "Test Contents")

    def test_split_pdf_into_images(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # Call the function
            result = split_pdf_into_images(self.need_ocr_pdf_content, temp_dir)
            print(f"Result: {result}")
            # Check the results
            self.assertEqual(len(result), 1)
            self.assertTrue(all(path.endswith(".png") for path in result))

            # Verify that files were actually created
            for path in result:
                self.assertTrue(os.path.exists(path))
