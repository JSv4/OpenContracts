# Copyright (C) 2024 - John Scrudato
import json
import logging
import responses

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.conf import settings
from django.db import transaction
from django.core.files.base import ContentFile

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import (
    nlm_ingest_pdf
)
from opencontractserver.tests.fixtures import (
    NLM_INGESTOR_SAMPLE_PDF,
    NLM_INGESTOR_EXPECTED_JSON
)

User = get_user_model()

logger = logging.getLogger(__name__)


class NlmIngestorTestCase(TestCase):

    def setUp(self):

        # Setup a test user ######################################################################
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(
            NLM_INGESTOR_SAMPLE_PDF.open("rb").read(), name="test.pdf"
        )

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="NVCA Sample COI Pages 1-4",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

    @responses.activate
    def test_load_nlm_ingested_doc(self):

        nlm_parse_response = responses.Response(
            method="POST",
            url=settings.NLM_INGEST_HOSTNAME + "/api/parseDocument/?calculate_opencontracts_data=yes&applyOcr=no",
            json=json.loads(NLM_INGESTOR_EXPECTED_JSON.read_text())
        )
        responses.add(nlm_parse_response)

        # Run ingest pipeline SYNCHRONOUS and, with @responses.activate decorator, no API call ought to go out to
        # nlm-ingestor host
        nlm_ingest_pdf.s(user_id=self.user.id, doc_id=self.doc.id).apply().get()

        # Let's make sure we have right # of annotations + labels in database
        assert Annotation.objects.all().count() == 27
        assert AnnotationLabel.objects.all().count() == 4
