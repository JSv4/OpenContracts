import json
import logging
from typing import Optional

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.docling_parser import DoclingParser
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
    SAMPLE_TXT_FILE_ONE_PATH,
)
from opencontractserver.types.dicts import OpenContractDocExport

User = get_user_model()
logger = logging.getLogger(__name__)


class DoclingParserIntegrationTestCase(TestCase):
    """
    Integration test case for the DoclingParser without using mocks.
    """

    def setUp(self) -> None:
        """
        Set up the test case by creating a user, a document, and loading expected outputs.
        """
        # Load expected outputs
        with SAMPLE_PAWLS_FILE_ONE_PATH.open("r") as f:
            self.expected_pawls = json.load(f)
        with SAMPLE_TXT_FILE_ONE_PATH.open("r") as f:
            self.expected_text = f.read()

        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )

        # Use the sample PDF file from fixtures
        with SAMPLE_PDF_FILE_ONE_PATH.open("rb") as f:
            self.test_pdf = ContentFile(f.read(), name=SAMPLE_PDF_FILE_ONE_PATH.name)

        # with SAMPLE_PDF_FILE_TWO_PATH.open("rb") as f:
        #     self.test_pdf = ContentFile(f.read(), name=SAMPLE_PDF_FILE_TWO_PATH.name)

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Document",
                description="Test description",
                pdf_file=self.test_pdf,
            )

    def test_docling_parser(self) -> None:
        """
        Test the DoclingParser by parsing a sample PDF document and comparing the result with expected outputs.
        """
        # Create an instance of the DoclingParser
        parser = DoclingParser()

        # Call the parse_document method
        result: Optional[OpenContractDocExport] = parser.parse_document(
            user_id=self.user.id, doc_id=self.doc.id
        )

        # Assertions
        self.assertIsNotNone(result, "Parser returned None")
        assert result is not None  # For type checker

        self.assertEqual(result["title"], "Exhibit 10.1")

        self.assertEqual(result["page_count"], 23)

        # Assert token counts for each page
        expected_token_counts = [
            392,
            374,
            470,
            350,
            490,
            431,
            386,
            585,
            463,
            577,
            806,
            276,
            706,
            563,
            428,
            426,
            572,
            616,
            465,
            335,
            496,
            43,
            6,
        ]

        for page_idx, page in enumerate(result["pawls_file_content"]):
            self.assertEqual(
                len(page["tokens"]),
                expected_token_counts[page_idx],
                f"Token count mismatch on page {page_idx + 1}",
            )

        # Assert relationships
        self.assertEqual(len(result["relationships"]), 24, "Expected 24 Relationships!:")

        # Assert labelled text length
        self.assertEqual(
            len(result["labelled_text"]), 272, "Labelled text length mismatch"
        )

    def test_docling_parser_force_ocr(self) -> None:
        """
        Test the DoclingParser by parsing a sample PDF document and comparing the result with expected outputs.
        """
        # Create an instance of the DoclingParser
        parser = DoclingParser()

        # Call the parse_document method
        result: Optional[OpenContractDocExport] = parser.parse_document(
            user_id=self.user.id, doc_id=self.doc.id, force_ocr=True
        )

        # Assertions
        self.assertIsNotNone(result, "Parser returned None")
        assert result is not None  # For type checker

        self.assertEqual(result["title"], "Exhibit 10.1")

        self.assertEqual(result["page_count"], 23)

        for page_id, page in enumerate(result["pawls_file_content"]):
            logger.info(f"Token count on page {page_id}: {len(page['tokens'])}")

        # Assert token counts for each page
        expected_token_counts = [
            391,
            374,
            470,
            350,
            490,
            431,
            381,
            569,
            463,
            577,
            806,
            276,
            706,
            563,
            427,
            426,
            572,
            616,
            465,
            335,
            496,
            43,
            6,
        ]

        for page_idx, page in enumerate(result["pawls_file_content"]):
            self.assertEqual(
                len(page["tokens"]),
                expected_token_counts[page_idx],
                f"Token count mismatch on page {page_idx + 1}",
            )

        # Assert labelled text length
        self.assertEqual(
            len(result["labelled_text"]), 272, "Labelled text length mismatch"
        )
        
        self.assertEqual(len(result["relationships"]), 24, "Expected 24 Relationships!:")


    def tearDown(self) -> None:
        """
        Clean up any temporary files or objects created during the test.
        """
        if self.doc.pdf_file:
            self.doc.pdf_file.delete()
        self.doc.delete()
        self.user.delete()
