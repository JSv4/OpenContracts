#  Copyright (C) 2022  John Scrudato
import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import (
    burn_doc_annotations,
    convert_doc_to_funsd,
    extract_pdf_thumbnail,
    set_doc_lock_state,
)
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
)
from opencontractserver.types.enums import LabelType

User = get_user_model()

logger = logging.getLogger(__name__)


class DocParserTestCase(TestCase):
    def setUp(self):

        # Setup a test user ######################################################################
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_ONE_PATH.open("rb").read(), name="test.pdf"
        )
        pawls_file = ContentFile(
            SAMPLE_PAWLS_FILE_ONE_PATH.open("rb").read(), name="test.pawls"
        )

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="USC Title 1 - Chapter 1",
                custom_meta={},
                pdf_file=pdf_file,
                pawls_parse_file=pawls_file,
                backend_lock=True,
            )
            self.corpus = Corpus(
                title="Test", description="Some important stuff!", creator=self.user
            )
            self.corpus.save()

    def test_pdf_thumbnail_extraction(self):

        # TODO - expand test to actually check results
        extract_pdf_thumbnail.s(doc_id=self.doc.id).apply().get()

    def test_set_doc_lock_state(self):
        set_doc_lock_state.apply(kwargs={"locked": True, "doc_id": self.doc.id}).get()

        self.doc.refresh_from_db()
        self.assertTrue(self.doc.backend_lock)

    def test_burn_doc_annotations(self):
        # TODO - handle text labels and do substantive test
        label_lookups = {
            "text_labels": {},
            "doc_labels": {
                "test": {
                    "id": "1234",
                    "color": "red",
                    "description": "stuff happening",
                    "icon": "tag",
                    "text": "test",
                    "label_type": LabelType.DOC_TYPE_LABEL,
                }
            },
        }
        result = burn_doc_annotations.apply(
            args=(label_lookups, self.doc.id, self.corpus.id)
        ).get()
        self.assertEqual(len(result), 5)

    def test_convert_doc_to_funsd(self):

        AnnotationLabel.objects.create(
            text="TestLabel", creator=self.user, label_type="TOKEN_LABEL"
        )
        Annotation.objects.create(
            raw_text="Test annotation",
            annotation_label=AnnotationLabel.objects.first(),
            document=self.doc,
            corpus_id=self.corpus.id,
            creator=self.user,
            json={
                "0": {
                    "tokensJsons": [],
                    "rawText": "Test",
                    "bounds": {"x": 0, "y": 0, "width": 10, "height": 10},
                }
            },
        )

        result = convert_doc_to_funsd.apply(args=(self.user.id, self.doc.id, 1)).get()

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], self.doc.id)
        self.assertIsInstance(result[1], dict)
        self.assertIsInstance(result[2], list)
