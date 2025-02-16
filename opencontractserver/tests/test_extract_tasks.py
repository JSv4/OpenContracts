import logging

import vcr
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks import oc_llama_index_doc_query

# Import the new trimming and assembly function for thorough testing
from opencontractserver.tasks.data_extract_tasks import (
    _assemble_and_trim_for_token_limit,
)
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()

# # Configure logging to a file relative to this test file's location
# LOG_DIR = os.path.dirname(__file__)
# logging.basicConfig(
#     filename=os.path.join(LOG_DIR, "test_extract_tasks.log"),
#     level=logging.DEBUG,
#     format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
#     force=True,
# )
# vcr_log = logging.getLogger("vcr")
# vcr_log.setLevel(logging.DEBUG)


class ExtractsTaskTestCase(BaseFixtureTestCase):
    """
    TestCase covering the orchestration of document extracts.
    Logs to a dedicated file for post-run review.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def setUp(self) -> None:
        """
        Sets up test fixtures by creating a fieldset, columns, and extracts,
        then associates them with prepopulated documents.
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
        # Additional column
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

    def vcr_response_handler(response):
        """
        Removes unwanted details from responses to keep cassettes streamlined.
        Also can skip certain host requests (huggingface) - in dev env, you
        probably want these to go through and in test env, they shouldn't need to
        as model will have been downloaded to container image.
        """
        if any(host in response.get("url", "") for host in ["huggingface.co", "hf.co"]):
            return None

        return response

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_run_extract_task.yaml",
        record_mode="once",
        filter_headers=["authorization"],
        before_record_response=vcr_response_handler,
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


class AssembleAndTrimForTokenLimitTestCase(TestCase):
    """
    Tests the _assemble_and_trim_for_token_limit function specifically
    to ensure coverage of token-limit exceedance logic, including partial
    and full trims across each category of text in the correct order.
    """

    def setUp(self) -> None:
        """
        Set up a dummy logger and calculate the static instruction block sizes.
        """
        self.logger = logging.getLogger("AssembleAndTrimForTokenLimitTestCase")

        # Define our token counting function
        def fake_token_length(text: str) -> int:
            """Counts whitespace-delimited chunks as 'tokens'."""
            return len(text.split())

        self.fake_token_length = fake_token_length

        # Static header/footer token counts (pre-calculated)
        self.RELATIONSHIP_INTRO_HEADER_TOKENS = (
            36  # "========== Relationship Introduction ==========" + instructions
        )
        self.RELATIONSHIP_MERMAID_HEADER_TOKENS = (
            56  # "========== Relationship Diagram ==========" + instructions
        )
        # "========== Detailed Relationship Descriptions ==========" + instructions
        self.RELATIONSHIP_DETAILED_HEADER_TOKENS = 53
        self.STRUCTURAL_HEADER_AND_FOOTER_TOKENS = (
            35  # Combined header + footer for structural section
        )
        self.RETRIEVED_HEADER_AND_FOOTER_TOKENS = (
            53  # Combined header + footer for retrieved section
        )

    def test_no_trimming_needed(self) -> None:
        """
        Tests that if all provided sections fit comfortably under the token limit
        (including their headers), no trimming occurs.
        """
        # Create test data - each line is 2 tokens
        relationship_intro = ["intro line1", "intro line2"]  # 4 tokens
        relationship_mermaid = ["mermaid line1"]  # 2 tokens
        relationship_detailed = ["detailed line1", "detailed line2"]  # 4 tokens
        structural_annots = ["Page1 line1"]  # 2 tokens
        raw_node_texts = ["Node1 text"]  # 2 tokens

        # Calculate total tokens needed:
        # Content tokens: 14
        # Headers: ~233 (sum of all headers if all sections present)
        max_token_length = 250  # Enough for all content + headers

        final_text = _assemble_and_trim_for_token_limit(
            structural_annots,
            raw_node_texts,
            relationship_intro,
            relationship_mermaid,
            relationship_detailed,
            max_token_length,
            self.fake_token_length,
            self.logger,
        )

        self.assertIsNotNone(final_text)
        # Verify all content present
        for snippet in [
            "intro line1",
            "mermaid line1",
            "detailed line1",
            "Page1 line1",
            "Node1 text",
        ]:
            self.assertIn(snippet, final_text)

    def test_partial_trimming_relationship_detailed(self) -> None:
        """
        Tests that relationship_detailed section is trimmed first when needed,
        accounting for its header size.
        """
        relationship_detailed = [f"detailed line{i}" for i in range(10)]  # 20 tokens
        relationship_intro = ["intro line"]  # 2 tokens
        relationship_mermaid = ["mermaid line"]  # 2 tokens
        structural_annots = ["Page1 line"]  # 2 tokens
        raw_node_texts = ["Node1 text"]  # 2 tokens

        # Calculate limit to force partial trimming of relationship_detailed:
        # Headers: ~233 if all sections present
        # Other content: 8 tokens
        # Want to keep some but not all relationship_detailed lines
        max_token_length = (
            250  # Should allow headers + other content + ~5 detailed lines
        )

        final_text = _assemble_and_trim_for_token_limit(
            structural_annots,
            raw_node_texts,
            relationship_intro,
            relationship_mermaid,
            relationship_detailed,
            max_token_length,
            self.fake_token_length,
            self.logger,
        )

        self.assertIsNotNone(final_text)
        self.assertIn("detailed line0", final_text)  # First lines should remain
        self.assertNotIn("detailed line9", final_text)  # Last lines should be trimmed
        # Other sections should remain intact
        for snippet in ["intro line", "mermaid line", "Page1 line", "Node1 text"]:
            self.assertIn(snippet, final_text)

    def test_trimming_multiple_categories(self) -> None:
        """
        Tests progressive trimming of categories when token limit forces removal,
        accounting for header sizes.
        """
        relationship_detailed = [f"det{i}" for i in range(5)]  # 5 tokens
        relationship_mermaid = [f"mer{i}" for i in range(5)]  # 5 tokens
        relationship_intro = [f"intro{i}" for i in range(5)]  # 5 tokens
        structural_annots = [f"page{i}" for i in range(2)]  # 2 tokens
        raw_node_texts = [f"node{i}" for i in range(2)]  # 2 tokens

        # Set limit to force removal of relationship sections but keep structural and raw:
        # Structural header + footer: 35 tokens
        # Retrieved header + footer: 53 tokens
        # Structural content: 2 tokens
        # Raw node content: 2 tokens
        max_token_length = (
            100  # Should only allow structural and raw sections with headers
        )

        final_text = _assemble_and_trim_for_token_limit(
            structural_annots,
            raw_node_texts,
            relationship_intro,
            relationship_mermaid,
            relationship_detailed,
            max_token_length,
            self.fake_token_length,
            self.logger,
        )

        self.assertIsNotNone(final_text)
        # Relationship sections should be fully removed
        for d in relationship_detailed:
            self.assertNotIn(d, final_text)
        for m in relationship_mermaid:
            self.assertNotIn(m, final_text)
        for i in relationship_intro:
            self.assertNotIn(i, final_text)
        # But structural and raw should remain
        self.assertIn("page0", final_text)
        self.assertIn("node0", final_text)

    def test_exceed_all_and_return_none(self) -> None:
        """
        Tests that we return None if even the smallest possible section with its
        header would exceed the token limit.
        """
        # Create minimal content for each section
        relationship_detailed = ["RDet"]  # 1 token
        relationship_mermaid = ["RMer"]  # 1 token
        relationship_intro = ["RIntro"]  # 1 token
        structural_annots = ["Struct"]  # 1 token
        raw_node_texts = ["NodeT"]  # 1 token

        # Set limit below smallest possible header + content combination
        max_token_length = 20  # Less than any single header

        final_text = _assemble_and_trim_for_token_limit(
            structural_annots,
            raw_node_texts,
            relationship_intro,
            relationship_mermaid,
            relationship_detailed,
            max_token_length,
            self.fake_token_length,
            self.logger,
        )
        self.assertEqual(final_text, "")
