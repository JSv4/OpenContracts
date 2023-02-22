#  Copyright (C) 2022  John Scrudato
import base64
import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import extract_thumbnail, split_pdf_for_processing
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()

logger = logging.getLogger(__name__)


class DocParserTestCase(TestCase):
    def setUp(self):

        # Setup a test user ######################################################################
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(SAMPLE_PDF_FILE_TWO_PATH.open('rb').read(), name="test.pdf")

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="USC Title 1 - Chapter 1",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

    def test_pdf_thumbnail_extraction(self):

        # TODO - expand test to actually check results
        extract_thumbnail.s(
            doc_id=self.doc.id
        ).apply().get()


    def test_pdf_sharding(self):
        shards = split_pdf_for_processing.s(
            user_id=self.user.id,
            doc_id=self.doc.id
        ).apply().get()

        self.assertEqual(
            len(shards),
            9
        )
