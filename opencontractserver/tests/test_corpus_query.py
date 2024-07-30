import vcr
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.annotations.models import Annotation
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.corpuses.models import Corpus, CorpusQuery
from opencontractserver.corpuses.signals import run_query_on_create
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import process_doc_on_create_atomic
from opencontractserver.tasks.doc_tasks import nlm_ingest_pdf
from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
)
from opencontractserver.tasks.query_tasks import run_query
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


class QueryTasksTestCase(TestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self):

        post_save.disconnect(run_query_on_create, sender=CorpusQuery)
        post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)
        post_save.disconnect(process_doc_on_create_atomic, sender=Document)

        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )

        # Create any necessary test data
        self.corpus = Corpus.objects.create(title="Test Corpus")

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Doc",
            description="USC Title 1 - Chapter 1",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )

        # Run ingest pipeline SYNCHRONOUS and, with @responses.activate decorator, no API call ought to go out to
        # nlm-ingestor host
        nlm_ingest_pdf.delay(user_id=self.user.id, doc_id=self.doc.id)

        # Manually run the calcs for the embeddings as post_save hook is hard
        # to await for in test
        for annot in Annotation.objects.all():
            calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

        self.corpus.documents.add(self.doc)
        self.corpus.save()

        self.query = CorpusQuery.objects.create(
            query="Test query", corpus=self.corpus, creator=self.user
        )

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette("fixtures/vcr_cassettes/run_query.yaml", filter_headers=['authorization'])
    def test_run_query(self):

        print(self.query)
        # Call the run_query task
        run_query.delay(query_id=self.query.id)

        # Refresh the query object from the database
        self.query.refresh_from_db()

        # Assert the expected behavior
        self.assertIsNotNone(self.query.started)
        self.assertIsNotNone(self.query.completed)
        self.assertIsNone(self.query.failed)
        self.assertIsNone(self.query.stacktrace)
        self.assertIsNotNone(self.query.response)
        self.assertTrue(self.query.sources.exists())
