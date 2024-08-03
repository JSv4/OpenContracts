import vcr
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.annotations.models import Annotation
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.documents.models import Document, DocumentAnalysisRow
from opencontractserver.documents.signals import process_doc_on_create_atomic
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks import oc_llama_index_doc_query
from opencontractserver.tasks.doc_tasks import nlm_ingest_pdf
from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
)
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsTaskTestCase(TestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self):

        post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)
        post_save.disconnect(process_doc_on_create_atomic, sender=Document)

        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.fieldset = Fieldset.objects.create(
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            query="What is the name of this document",
            output_type="str",
            agentic=True,
            creator=self.user,
            # Let's test setting extract engine dynamically
            task_name="opencontractserver.tasks.data_extract_tasks.llama_index_react_agent_query",
        )
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            query="Provide a list of the defined terms ",
            match_text="A defined term is defined as a term that is defined...\n|||\nPerson shall mean a person.",
            output_type="str",
            agentic=True,
            creator=self.user,
        )
        self.extract = Extract.objects.create(
            name="TestExtract",
            fieldset=self.fieldset,
            creator=self.user,
        )

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

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        # We're going to manually process three docs
        self.doc = Document.objects.create(
            creator=self.user,
            title="Rando Doc",
            description="RANDO DOC!",
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

        self.doc2 = Document.objects.create(
            creator=self.user,
            title="Rando Doc 2",
            description="RANDO DOC! 2",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )

        # Run ingest pipeline SYNCHRONOUS and, with @responses.activate decorator, no API call ought to go out to
        # nlm-ingestor host
        nlm_ingest_pdf.delay(user_id=self.user.id, doc_id=self.doc2.id)

        # Manually run the calcs for the embeddings as post_save hook is hard
        # to await for in test
        for annot in Annotation.objects.filter(document_id=self.doc2.id):
            calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

        self.doc3 = Document.objects.create(
            creator=self.user,
            title="Rando Doc 2",
            description="RANDO DOC! 2",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )

        # Run ingest pipeline SYNCHRONOUS and, with @responses.activate decorator, no API call ought to go out to
        # nlm-ingestor host
        nlm_ingest_pdf.delay(user_id=self.user.id, doc_id=self.doc3.id)

        # Manually run the calcs for the embeddings as post_save hook is hard
        # to await for in test
        for annot in Annotation.objects.filter(document_id=self.doc3.id):
            calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

        self.extract.documents.add(self.doc, self.doc2, self.doc3)
        self.extract.save()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_run_extract_task.yaml",
        filter_headers=["authorization"],
    )
    def test_run_extract_task(self):
        print(f"{self.extract.documents.all()}")

        # Run this SYNCHRONOUSLY for TESTIN' purposes
        run_extract.delay(self.extract.id, self.user.id)
        print(Datacell.objects.all().count())

        self.extract.refresh_from_db()
        self.assertIsNotNone(self.extract.started)

        self.assertEqual(6, Datacell.objects.all().count())
        cells = Datacell.objects.filter(extract=self.extract, column=self.column).first()
        self.assertIsNotNone(cells)

        rows = DocumentAnalysisRow.objects.filter(extract=self.extract)
        self.assertEqual(3, rows.count())

        for cell in Datacell.objects.all():
            print(f"Cell data: {cell.data}")
            print(f"Cell started: {cell.started}")
            print(f"Cell completed: {cell.completed}")
            print(f"Cell failed: {cell.failed}")
            oc_llama_index_doc_query.delay(cell.id)
            self.assertIsNotNone(cell.data)
