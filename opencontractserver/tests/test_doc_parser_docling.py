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
            user_id=self.user.id, doc_id=self.doc.id, roll_up_groups=True
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
        self.assertEqual(
            len(result["relationships"]), 24, "Expected 24 Relationships!:"
        )

        # Assert labelled text length
        self.assertEqual(
            len(result["labelled_text"]), 272, "Labelled text length mismatch"
        )

    def test_docling_parser_force_ocr(self) -> None:
        """
        Test the DoclingParser by parsing a sample PDF document with OCR forced.
        """
        # Create an instance of the DoclingParser
        parser = DoclingParser()

        # Call the parse_document method
        result: Optional[OpenContractDocExport] = parser.parse_document(
            user_id=self.user.id,
            doc_id=self.doc.id,
            force_ocr=True,
            roll_up_groups=True,
        )

        # Assertions
        self.assertIsNotNone(result, "Parser returned None")
        assert result is not None  # For type checker

        self.assertEqual(result["title"], "Exhibit 10.1")
        self.assertEqual(result["page_count"], 23)

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

        self.assertEqual(
            len(result["labelled_text"]), 272, "Labelled text length mismatch"
        )

        self.assertEqual(
            len(result["relationships"]), 24, "Expected 24 Relationships!:"
        )

    def test_docling_parser_omit_roll_up_groups(self) -> None:
        """
        Test the DoclingParser by parsing the sample PDF document with roll_up_groups=False (unset).
        Ensures that relationships are not "rolled up" into group relationships.
        """
        parser = DoclingParser()
        result: Optional[OpenContractDocExport] = parser.parse_document(
            user_id=self.user.id, doc_id=self.doc.id
        )

        self.assertIsNotNone(result, "Parser returned None")
        assert result is not None  # For type checker

        self.assertEqual(result["title"], "Exhibit 10.1")
        self.assertEqual(result["page_count"], 23)

        # Even though the total token counts or labelled_text might remain identical,
        # the relationships count is expected to differ because of group roll-up.
        # We can check that we still have some relationships, but the count may differ
        # from the non-rolled-up scenario.
        self.assertEqual(
            len(result["relationships"]),
            402,
            "With roll_up_groups=False, we expect a vastly large number of relationships than roll_up_groups=True.",
        )

        # Labelled text is generally unaffected by grouping
        self.assertEqual(
            len(result["labelled_text"]), 272, "Labelled text length mismatch"
        )

    def tearDown(self) -> None:
        """
        Clean up any temporary files or objects created during the test.
        """
        if self.doc.pdf_file:
            self.doc.pdf_file.delete()
        self.doc.delete()
        self.user.delete()
