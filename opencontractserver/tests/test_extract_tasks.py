import logging
from typing import Any

import vcr
from django.contrib.auth import get_user_model
from django.test.utils import override_settings

from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks import oc_llama_index_doc_query
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()

# Configure logging to a file so you can review all logs after the test run
logging.basicConfig(
    filename="test_extract_tasks.log",
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)


class TestContext:
    def __init__(self, user: Any) -> None:
        """
        Container for user-related test context.

        Args:
            user: The user instance to associate with this context.
        """
        self.user = user


class ExtractsTaskTestCase(BaseFixtureTestCase):
    """
    TestCase covering the orchestration of document extracts. This test demonstrates
    logging to a dedicated file so you may review all logs after the test run.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self) -> None:
        """
        Sets up test fixtures by creating a fieldset, columns, and extracts, then
        associates them with prepopulated documents.
        """
        super().setUp()
        logging.info("Setting up ExtractsTaskTestCase data.")

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
        record_mode="none",
        filter_headers=["authorization"],
        before_record_response=lambda response: None
        if "huggingface.co" in response.get("url", "")
        or "hf.co" in response.get("url", "")
        else response,
        match_on=["method"],
        ignore_hosts=[
            "huggingface.co",
            "hf.co",
            "cdn-lfs.huggingface.co",
            "cdn-lfs.hf.co",
        ],
        ignore_query_params=True,
    )
    def test_run_extract_task(self) -> None:
        """
        Tests the run_extract Celery task by running it synchronously (always eager)
        and checking that Datacells are created as expected. Logs progress info to the
        test_extract_tasks.log file for post-run review.
        """
        logging.info("Starting test_run_extract_task with run_extract.delay().")
        run_extract.delay(self.extract.id, self.user.id)

        cell_count = Datacell.objects.all().count()
        logging.debug(f"Total Datacell count after run_extract: {cell_count}")

        self.extract.refresh_from_db()
        self.assertIsNotNone(
            self.extract.started, "Extract should have a 'started' timestamp."
        )
        self.assertEqual(6, cell_count, "Expected 6 Datacell objects to be created.")

        cells = Datacell.objects.filter(
            extract=self.extract, column=self.column
        ).first()
        self.assertIsNotNone(
            cells, "There should be at least one Datacell for the tested Column."
        )

        rows = DocumentAnalysisRow.objects.filter(extract=self.extract)
        self.assertEqual(3, rows.count(), "Expected 3 DocumentAnalysisRow objects.")

        for cell in Datacell.objects.all():
            logging.debug(
                f"Cell ID: {cell.id}, data: {cell.data}, started: {cell.started}, "
                f"completed: {cell.completed}, failed: {cell.failed}"
            )
            oc_llama_index_doc_query.delay(cell.id)
            self.assertIsNotNone(
                cell.data, "Datacell data should not be None after extraction."
            )
