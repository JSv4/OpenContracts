# Copyright (C) 2024 - John Scrudato
import json
import logging

import responses
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.nlm_ingest_parser import NLMIngestParser
from opencontractserver.tests.fixtures import (
    NLM_INGESTOR_EXPECTED_JSON,
    NLM_INGESTOR_SAMPLE_PDF,
    SAMPLE_PAWLS_FILE_ONE_PATH,
)
from opencontractserver.types.dicts import OpenContractDocExport

User = get_user_model()
logger = logging.getLogger(__name__)


class ParseWithNLMTestCase(TestCase):
    def setUp(self):
        # Setup a test user
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(
            NLM_INGESTOR_SAMPLE_PDF.open("rb").read(), name="test.pdf"
        )

        pawls_file = ContentFile(
            SAMPLE_PAWLS_FILE_ONE_PATH.open("rb").read(), name="test.pawls"
        )

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="NVCA Sample COI Pages 1-4",
                custom_meta={},
                pdf_file=pdf_file,
                pawls_parse_file=pawls_file,
                backend_lock=True,
            )
            self.corpus = Corpus(
                title="Test", description="Some important stuff!", creator=self.user
            )
            self.corpus.save()

    @responses.activate
    def test_parse_with_nlm(self):
        # Mock the NLM ingest service response
        endpoint = settings.PARSER_KWARGS[
            "opencontractserver.pipeline.parsers.nlm_ingest_parser.NLMIngestParser"
        ]["endpoint"]
        nlm_parse_response = responses.Response(
            method="POST",
            url=f"{endpoint}/api/parseDocument",
            json=json.loads(NLM_INGESTOR_EXPECTED_JSON.read_text()),
            status=402,
        )
        responses.add(nlm_parse_response)

        # Call the parse_with_nlm function
        parser = NLMIngestParser()
        open_contracts_data: OpenContractDocExport = parser.parse_document(
            user_id=self.user.id, doc_id=self.doc.id
        )

        # Assertions
        self.assertIsNotNone(open_contracts_data)
        self.assertIn("title", open_contracts_data)
        self.assertIn("content", open_contracts_data)
        self.assertIn("pawls_file_content", open_contracts_data)
        self.assertIn("labelled_text", open_contracts_data)
        self.assertEqual(len(open_contracts_data["labelled_text"]), 27)
        self.assertEqual(open_contracts_data["title"], "Grab title from parser")
