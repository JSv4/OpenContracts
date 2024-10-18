# Copyright (C) 2024 - John Scrudato
import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import ingest_txt
from opencontractserver.tests.fixtures import SAMPLE_TXT_FILE_ONE_PATH

User = get_user_model()

logger = logging.getLogger(__name__)


class TxtIngestorTestCase(TestCase):
    def setUp(self):
        # Setup a test user
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        # Create a test document with a text file
        with SAMPLE_TXT_FILE_ONE_PATH.open('rb') as f:
            txt_content = f.read()

        txt_file = ContentFile(txt_content, name="test.txt")

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="Sample Text File",
                custom_meta={},
                txt_extract_file=txt_file,
                file_type="application/txt",
                backend_lock=True,
            )

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_ingest_txt(self):
        # Run ingest pipeline synchronously
        ingest_txt.si(user_id=self.user.id, doc_id=self.doc.id).apply()

        # Check if the SENTENCE label was created
        sentence_label = AnnotationLabel.objects.filter(
            text="SENTENCE",
            creator=self.user,
            label_type="SPAN_LABEL",
            read_only=True
        ).first()
        self.assertIsNotNone(sentence_label)

        # Check if annotations were created
        annotations = Annotation.objects.filter(document=self.doc)
        self.assertGreater(annotations.count(), 0)

        # Check properties of the first annotation
        first_annotation = annotations.first()
        self.assertEqual(first_annotation.annotation_label, sentence_label)
        self.assertEqual(first_annotation.annotation_type, "SPAN_LABEL")
        self.assertTrue(first_annotation.structural)
        self.assertEqual(first_annotation.creator, self.user)

        # Check if the annotation JSON contains start and end
        self.assertIn('start', first_annotation.json)
        self.assertIn('end', first_annotation.json)

        # Verify that all annotations have non-empty raw_text
        for annotation in annotations:
            self.assertTrue(annotation.raw_text.strip())

        logger.info(f"Created {annotations.count()} sentence annotations")
