import logging
from unittest.mock import MagicMock, patch

import vcr
from django.test.utils import override_settings

from opencontractserver.extracts.models import Column, Extract, Fieldset
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.base import BaseFixtureTestCase


class SimpleExtractsTaskTestCase(BaseFixtureTestCase):
    """
    Simplified TestCase covering the orchestration of document extracts.
    This version focuses on minimal mocking to test the essential functionality.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self) -> None:
        """
        Sets up test fixtures by creating a fieldset, columns, and extracts,
        then associates them with prepopulated documents.
        """
        super().setUp()
        logging.info("Setting up SimpleExtractsTaskTestCase data.")

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
        self.extract = Extract.objects.create(
            name="TestExtract",
            fieldset=self.fieldset,
            creator=self.user,
        )

        self.extract.documents.add(self.doc, self.doc2, self.doc3)
        self.extract.save()

    def vcr_response_handler(response):
        """
        Removes unwanted details from responses to keep cassettes streamlined.
        """
        if any(host in response.get("url", "") for host in ["huggingface.co", "hf.co"]):
            return None
        return response

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_simple_extract_task.yaml",
        record_mode="none",  # Use new_episodes to create a new cassette
        filter_headers=["authorization"],
        before_record_response=vcr_response_handler,
        ignore_hosts=[
            "huggingface.co",
            "hf.co",
            "cdn-lfs.huggingface.co",
            "cdn-lfs.hf.co",
        ],
        ignore_query_params=True,
    )
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.get_task_by_name")
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.group")
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.chord")
    @patch(
        "opencontractserver.tasks.data_extract_tasks.StructuredPlannerAgent.chat",
        return_value="mocked agent response",
    )
    @patch("marvin.cast", return_value="value1")
    @patch("marvin.extract", return_value=["value1", "value2"])
    @patch(
        "opencontractserver.tasks.data_extract_tasks.llama_index_react_agent_query",
        return_value={"result": "mocked agent result"},
    )
    def test_simple_run_extract(
        self,
        mock_query,
        mock_extract,
        mock_cast,
        mock_agent_chat,
        mock_chord,
        mock_group,
        mock_get_task_by_name,
    ):
        """
        Simplified test for the run_extract function with minimal mocking.
        """
        # Setup mocks for task orchestration
        mock_task = MagicMock()
        mock_task.si.return_value = "mocked_task"
        mock_get_task_by_name.return_value = mock_task
        mock_group.return_value = "mocked_group"
        mock_chord.return_value.return_value = None

        # Run the task directly
        logging.info("Starting test_simple_run_extract with run_extract().")

        # Get the initial count of datacells
        initial_datacell_count = self.extract.extracted_datacells.count()

        # Run the extract
        run_extract(self.extract.id, self.user.id)

        # Refresh the extract from the database
        self.extract.refresh_from_db()

        # Verify the extract was marked as started
        self.assertIsNotNone(
            self.extract.started, "Extract should have a 'started' timestamp."
        )

        # Verify that datacells were created (one per document per column)
        expected_datacell_count = initial_datacell_count + (
            len(self.extract.documents.all()) * 1
        )
        actual_datacell_count = self.extract.extracted_datacells.count()

        self.assertEqual(
            expected_datacell_count,
            actual_datacell_count,
            f"Expected {expected_datacell_count} datacells, but got {actual_datacell_count}",
        )
