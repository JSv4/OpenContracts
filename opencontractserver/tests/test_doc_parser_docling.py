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
            user_id=self.user.id, doc_id=self.doc.id
        )

        # Assertions
        self.assertIsNotNone(result, "Parser returned None")
        assert result is not None  # For type checker

        # Compare content
        self.assertEqual(
            result["content"], self.expected_text,
            "Parser content does not match expected text"
        )

        # Compare PAWLS file content
        self.assertEqual(
            result["pawls_file_content"], self.expected_pawls,
            "Parser PAWLS content does not match expected PAWLS"
        )

        # Additional assertions can be added here
        # For example, check the title
        self.assertEqual(
            result["title"], "Test Document",
            "Parser title does not match expected title"
        )

        # Check page count
        self.assertEqual(
            result["page_count"], len(self.expected_pawls),
            "Parser page count does not match expected page count"
        )

    def tearDown(self) -> None:
        """
        Clean up any temporary files or objects created during the test.
        """
        if self.doc.pdf_file:
            self.doc.pdf_file.delete()
        self.doc.delete()
        self.user.delete()
