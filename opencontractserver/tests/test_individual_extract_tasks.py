"""
Tests to synchronously invoke and verify the oc_llama_index_doc_query Celery task
using BaseFixtureTestCase, ensuring that the Extract models and related objects
(Fieldset, Column, Datacell) are set up correctly.
"""
import logging
# from typing import Optional

# import vcr
from django.contrib.auth import get_user_model
# from django.db import connections
from django.test import TestCase
# from django.test.utils import override_settings

# from opencontractserver.documents.models import DocumentAnalysisRow
# from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks.data_extract_tasks import (
    _assemble_and_trim_for_token_limit,
    # oc_llama_index_doc_query,
)
# from opencontractserver.tests.base import CeleryEagerModeFixtureTestCase

vcr_log = logging.getLogger("vcr")
vcr_log.setLevel(logging.WARNING)

User = get_user_model()


# class TestOcLlamaIndexDocQuery(CeleryEagerModeFixtureTestCase):
#     """
#     Tests oc_llama_index_doc_query by creating an Extract along with the
#     Datacell, Column, and Fieldset models, then invoking the Celery task
#     synchronously to confirm its behavior.
#     """

#     @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
#     def test_oc_llama_index_doc_query_synchronously(self) -> None:
#         """
#         Ensures that oc_llama_index_doc_query can be called with a valid Datacell (and
#         related models) in Celery's eager mode. The resulting output is asserted for
#         correctness and to confirm synchronous operation.
#         """
#         # Create a Fieldset
#         fieldset: Fieldset = Fieldset.objects.create(
#             name="Test Fieldset",
#             description="Used to group columns for extraction.",
#             creator=self.user,
#         )

#         # Create a Column (which references the Fieldset)
#         column: Column = Column.objects.create(
#             name="Test Column",
#             fieldset=fieldset,
#             output_type="text",
#             query=None,
#             match_text=None,
#             must_contain_text=None,
#             creator=self.user,
#         )

#         # Create an Extract (which references a Corpus and Fieldset)
#         # self.corpus is created by BaseFixtureTestCase
#         extract: Extract = Extract.objects.create(
#             corpus=self.corpus,
#             name="Test Extract",
#             fieldset=fieldset,
#             creator=self.user,
#         )

#         # Create a Datacell referencing our Document, Extract, and Column
#         datacell: Datacell = Datacell.objects.create(
#             extract=extract,
#             column=column,
#             document=self.doc,
#             data_definition="Test definition for llama index",
#             creator=self.user,
#         )

#         # Ensure connection is fresh before invoking the task
#         for alias in connections:
#             connections[alias].close_if_unusable_or_obsolete()
#             connections[alias].connect()

#         try:
#             # Invoke the Celery task synchronously (via .get())
#             oc_llama_index_doc_query.delay(
#                 cell_id=datacell.id, similarity_top_k=3, max_token_length=1000
#             ).get()

#             # After task completion, refresh connection before database access
#             for alias in connections:
#                 connections[alias].close_if_unusable_or_obsolete()
#                 connections[alias].connect()

#             # Now access the database
#             datacell.refresh_from_db()
#             result = datacell.data

#             # Assert the result is valid
#             self.assertIsNotNone(
#                 result, "Expected a non-None result from oc_llama_index_doc_query."
#             )

#             # Optionally, assert structure/contents of 'result' as appropriate for your logic
#             # self.assertIn("some_expected_value", str(result))

#             print(f"Synchronous oc_llama_index_doc_query result: {result}")
#         except Exception as e:
#             logging.error(
#                 f"Exception in test_oc_llama_index_doc_query_synchronously: {e}"
#             )
#             import traceback

#             logging.error(traceback.format_exc())
#             raise


# class TestOcLlamaIndexDocQueryDirect(CeleryEagerModeFixtureTestCase):
#     """
#     A test class that uses the same fixture setup as our orchestrator-based test
#     but calls the oc_llama_index_doc_query task directly on newly created Datacells.
#     """

#     @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
#     def setUp(self) -> None:
#         """
#         Sets up test data similarly to ExtractsTaskTestCase, using the same test fixtures
#         to ensure we're able to test oc_llama_index_doc_query in isolation with identical
#         environment conditions.
#         """
#         super().setUp()

#         logging.info("Setting up TestOcLlamaIndexDocQueryDirect data.")

#         self.fieldset: Fieldset = Fieldset.objects.create(
#             name="TestFieldsetForDirectTask",
#             description="Test description for direct llama index task invocation",
#             creator=self.user,
#         )

#         # Create first column with a designated task name
#         self.column1: Column = Column.objects.create(
#             fieldset=self.fieldset,
#             query="What is the name of this document?",
#             output_type="str",
#             agentic=False,  # agent keeps triggering some awful, buried issues with async tests.
#             creator=self.user,
#             task_name="opencontractserver.tasks.data_extract_tasks.llama_index_react_agent_query",
#         )

#         # Create a second column (just to match the multi-column scenario)
#         self.column2: Column = Column.objects.create(
#             fieldset=self.fieldset,
#             query="Provide a list of the defined terms",
#             match_text="A defined term is defined as a term that is defined...",
#             output_type="str",
#             agentic=False,
#             creator=self.user,
#         )

#         # Create the Extract that references our Fieldset
#         self.extract: Extract = Extract.objects.create(
#             name="TestExtractDirectTask",
#             fieldset=self.fieldset,
#             creator=self.user,
#         )

#         # Add documents (from BaseFixtureTestCase) to the Extract
#         self.extract.documents.add(self.doc, self.doc2, self.doc3)
#         self.extract.save()

#         logging.info("Fixture data set up complete for TestOcLlamaIndexDocQueryDirect.")

#     @staticmethod
#     def _vcr_response_handler(response) -> Optional[dict]:
#         """
#         A helper function used to remove unwanted details from responses
#         to keep cassettes streamlined. For instance, skip huggingface requests.
#         """
#         if any(host in response.get("url", "") for host in ["huggingface.co", "hf.co"]):
#             return None
#         return response

#     @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
#     @vcr.use_cassette(
#         "fixtures/vcr_cassettes/test_individual_extract_task.yaml",
#         record_mode="none",
#         filter_headers=["authorization"],
#         before_record_response=_vcr_response_handler,
#         ignore_hosts=[
#             "huggingface.co",
#             "hf.co",
#             "cdn-lfs.huggingface.co",
#             "cdn-lfs.hf.co",
#         ],
#         ignore_query_params=True,
#     )
#     def test_oc_llama_index_doc_query_task_directly(self) -> None:
#         """
#         Tests oc_llama_index_doc_query by creating new Datacells for each document
#         in the extract and calling the task directly against them. This allows more
#         focused testing without the extracts orchestration layer.
#         """
#         logging.info("Starting test_oc_llama_index_doc_query_task_directly.")

#         for doc in self.extract.documents.all():
#             cell = Datacell.objects.create(
#                 extract=self.extract,
#                 column=self.column1,
#                 document=doc,
#                 data_definition="Testing oc_llama_index_doc_query directly",
#                 creator=self.user,
#             )

#             # Ensure connection is fresh before invoking the task
#             for alias in connections:
#                 connections[alias].close_if_unusable_or_obsolete()
#                 connections[alias].connect()

#             try:
#                 oc_llama_index_doc_query.delay(cell.id).get()

#                 # After task completion, refresh connection before database access
#                 for alias in connections:
#                     connections[alias].close_if_unusable_or_obsolete()
#                     connections[alias].connect()

#                 # Reload the Datacell from DB if needed
#                 cell.refresh_from_db()
#                 result = cell.data
#                 logging.debug(f"Result for cell {cell.id}: {result}")

#                 # Basic checks
#                 self.assertIsNotNone(
#                     result, f"Expected a non-None result from cell {cell.id}"
#                 )
#                 self.assertIsNotNone(
#                     cell.data,
#                     f"The Datacell's data (ID: {cell.id}) should not be None after the extraction.",
#                 )
#             except Exception as e:
#                 logging.error(
#                     f"Exception in test_oc_llama_index_doc_query_task_directly for cell {cell.id}: {e}"
#                 )
#                 import traceback

#                 logging.error(traceback.format_exc())
#                 raise

#         # Double-check the number of DocumentAnalysisRows if desired
#         rows = DocumentAnalysisRow.objects.filter(extract=self.extract)
#         self.assertEqual(
#             rows.count(),
#             0,
#             "No DocumentAnalysisRow objects should be created here since we're only calling the single task directly.",
#         )

#         logging.info("Completed test_oc_llama_index_doc_query_task_directly.")


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
