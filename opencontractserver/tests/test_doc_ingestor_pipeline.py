import json
import logging
from unittest.mock import Mock

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.parsers.base_parser import parse_document
from opencontractserver.documents.models import Document
from opencontractserver.tests.fixtures import (
    NLM_INGESTOR_EXPECTED_JSON,
    NLM_INGESTOR_SAMPLE_PDF,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class ParseDocumentTestCase(TestCase):
    """
    Test case for parsing documents using different parsers.
    """

    def setUp(self):
        """
        Set up a test user before each test.
        """
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_parse_document(self):
        """
        Test parsing a document using the NLM parser.
        """
        # Prepare the document
        pdf_file = ContentFile(
            NLM_INGESTOR_SAMPLE_PDF.open("rb").read(), name="test_nlm.pdf"
        )
        with transaction.atomic():
            doc = Document.objects.create(
                creator=self.user,
                title="Test NLM Doc",
                description="Test document for NLM parser",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

        # Mock the NLM parser function
        expected_response = json.loads(NLM_INGESTOR_EXPECTED_JSON.read_text())['return_dict']['opencontracts_data']
        mock_parse = Mock(return_value=expected_response)

        # Call parse_document directly
        parse_document(self.user.id, doc.id, mock_parse)

        # Assertions
        doc.refresh_from_db()
        self.assertIsNotNone(doc.txt_extract_file)
        self.assertIsNotNone(doc.pawls_parse_file)
        
    # TODO test dynamic loading in ingest_doc task...
        
    def tearDown(self):
        """
        Clean up after each test.
        """
        Document.objects.all().delete()
        self.user.delete()
