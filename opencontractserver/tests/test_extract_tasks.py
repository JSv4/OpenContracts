import vcr
from django.contrib.auth import get_user_model
from django.test.utils import override_settings

from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks import oc_llama_index_doc_query
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user

# Using new base test that reloads preprocessed annotations and docs to *massively* reduce test time
class ExtractsTaskTestCase(BaseFixtureTestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self):
        super().setUp()

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

        self.extract.documents.add(self.doc, self.doc2, self.doc3)
        self.extract.save()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_run_extract_task.yaml",
        filter_headers=["authorization"],
        before_record_response=lambda response: None 
            if "huggingface.co" in response.get("url", "") or "hf.co" in response.get("url", "")
            else response,
        # Simplify the matcher to only look at the method and base path
        match_on=['method'],
        # Add both possible CDN domains so we can run this locally without preloading model and make requets to hf cdn without storing in casette. 
        ignore_hosts=['huggingface.co', 'hf.co', 'cdn-lfs.huggingface.co', 'cdn-lfs.hf.co'],
        ignore_query_params=True  # Ignore all query parameters in URL matching
    )
    def test_run_extract_task(self):
        # Run this SYNCHRONOUSLY for TESTIN' purposes
        run_extract.delay(self.extract.id, self.user.id)
        print(Datacell.objects.all().count())

        self.extract.refresh_from_db()
        self.assertIsNotNone(self.extract.started)

        self.assertEqual(6, Datacell.objects.all().count())
        cells = Datacell.objects.filter(
            extract=self.extract, column=self.column
        ).first()
        self.assertIsNotNone(cells)

        rows = DocumentAnalysisRow.objects.filter(extract=self.extract)
        self.assertEqual(3, rows.count())

        # TODO - this is not actually testing the extract WORKED.
        # looking at the codecov, seems tests keep failing when setting up embedder:

        for cell in Datacell.objects.all():
            print(f"Cell data: {cell.data}")
            print(f"Cell started: {cell.started}")
            print(f"Cell completed: {cell.completed}")
            print(f"Cell failed: {cell.failed}")
            oc_llama_index_doc_query.delay(cell.id)
            self.assertIsNotNone(cell.data)
