# Copyright (C) 2024 - John Scrudato
import json
import logging

import responses
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from django.test.utils import override_settings

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
    """
    TestCase using 'responses' library to mock out S3 HEAD/GET calls as well as
    the POST to an NLM ingestor-like endpoint. The approach follows the convention
    shown in the provided snippet, wrapping each mock as a responses.Response object
    and then adding it via responses.add(...).
    """

    def setUp(self) -> None:
        """
        Setup a test user and attach a test Document and Corpus.
        This doc normally resides in S3, but we will mock with 'responses'.
        """
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

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @responses.activate
    def test_parse_with_nlm(self) -> None:
        """
        Mock S3 HEAD, S3 GET, and the NLM ingestor POST requests, then parse
        the document and verify we get the correct OpenContractDocExport data.
        """

        nlm_hostname = settings.PARSER_KWARGS[
            "opencontractserver.pipeline.parsers.nlm_ingest_parser.NLMIngestParser"
        ]["endpoint"]
        nlm_parse_response = responses.Response(
            method="POST",
            url=nlm_hostname
            + "/api/parseDocument?calculate_opencontracts_data=yes&applyOcr=no",
            json=json.loads(NLM_INGESTOR_EXPECTED_JSON.read_text()),
        )
        responses.add(nlm_parse_response)

        # Run the parser
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
