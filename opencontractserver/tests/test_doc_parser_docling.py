import json
import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.documents.models import Document
from opencontractserver.parsers.docling import parse_with_docling
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
    SAMPLE_TXT_FILE_ONE_PATH,
)
from opencontractserver.types.dicts import OpenContractDocExport

User = get_user_model()
logger = logging.getLogger(__name__)


class ParseWithDoclingTestCase(TestCase):
    def setUp(self):
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
                backend_lock=False,
            )

    @patch(
        "opencontractserver.parsers.docling.DoclingToOpenContractsConverter.convert_pdf"
    )
    def test_parse_with_docling(self, mock_convert_pdf):
        # Mock the converter's convert_pdf method
        mock_convert_pdf.return_value = {
            "title": "Test Document",
            "content": self.expected_text,
            "description": None,
            "pawls_file_content": self.expected_pawls,
            "page_count": 1,
            "doc_labels": [],
            "labelled_text": [],
        }

        # Call the parse_with_docling function
        result: OpenContractDocExport = parse_with_docling(
            user_id=self.user.id, doc_id=self.doc.id
        )

        # Assertions
        self.assertIsNotNone(result)
        self.assertEqual(result["content"], self.expected_text)
        self.assertEqual(result["pawls_file_content"], self.expected_pawls)

    def tearDown(self):
        # Clean up any temporary files or objects
        if self.doc.pdf_file:
            self.doc.pdf_file.delete()
        self.doc.delete()
        self.user.delete()
