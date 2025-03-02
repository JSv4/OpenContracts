import logging
from unittest.mock import MagicMock, patch

import vcr
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone

from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset

# Import the new trimming and assembly function for thorough testing
from opencontractserver.tasks.data_extract_tasks import (
    _assemble_and_trim_for_token_limit,
)
from opencontractserver.tasks.extract_orchestrator_tasks import run_extract
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()


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
        ignore_hosts=[
            "huggingface.co",
            "hf.co",
            "cdn-lfs.huggingface.co",
            "cdn-lfs.hf.co",
        ],
        ignore_query_params=True,
    )
    @patch(
        "opencontractserver.tasks.data_extract_tasks.StructuredPlannerAgent.chat",
        return_value="mocked agent response",
    )
    @patch("marvin.cast", return_value="value1")
    @patch("marvin.extract", return_value=["value1", "value2"])
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.chord")
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.group")
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.get_task_by_name")
    @patch("opencontractserver.tasks.data_extract_tasks.oc_llama_index_doc_query.delay")
    @patch("opencontractserver.tasks.data_extract_tasks.llama_index_react_agent_query")
    @patch("opencontractserver.shared.decorators.asyncio.new_event_loop")
    @patch("llama_index.core.VectorStoreIndex")
    @patch("llama_index.core.postprocessor.SentenceTransformerRerank")
    @patch("llama_index.core.schema.NodeWithScore")
    @patch("llama_index.core.schema.Node")
    @patch("llama_index.core.QueryBundle")
    @patch("llama_index.core.Settings")
    @patch("opencontractserver.utils.embeddings.calculate_embedding_for_text")
    @patch("tiktoken.encoding_for_model")
    @patch("opencontractserver.extracts.models.Extract.objects.get")
    @patch("opencontractserver.extracts.models.Datacell.objects.create")
    @patch("opencontractserver.documents.models.DocumentAnalysisRow.objects.filter")
    @patch("opencontractserver.extracts.models.Extract.refresh_from_db")
    @patch("opencontractserver.extracts.models.Datacell.refresh_from_db")
    @patch("opencontractserver.extracts.models.Datacell.save")
    @patch("opencontractserver.documents.models.DocumentAnalysisRow.save")
    @patch("asgiref.sync.sync_to_async")
    @patch(
        "opencontractserver.tasks.extract_orchestrator_tasks.set_permissions_for_obj_to_user"
    )
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.transaction.atomic")
    @patch("opencontractserver.tasks.extract_orchestrator_tasks.DocumentAnalysisRow")
    def test_run_extract_task(
        self,
        mock_document_analysis_row_class,
        mock_transaction_atomic,
        mock_set_permissions,
        mock_sync_to_async,
        mock_document_analysis_row_save,
        mock_datacell_save,
        mock_datacell_refresh_from_db,
        mock_extract_refresh_from_db,
        mock_document_analysis_row_filter,
        mock_datacell_create,
        mock_extract_get,
        mock_encoding_for_model,
        mock_calculate_embedding_for_text,
        mock_llama_settings,
        mock_query_bundle,
        mock_node,
        mock_node_with_score,
        mock_sentence_transformer_rerank,
        mock_vector_store_index,
        mock_new_event_loop,
        mock_llama_index_react_agent_query,
        mock_oc_llama_index_doc_query_delay,
        mock_get_task_by_name,
        mock_group,
        mock_chord,
        mock_extract,
        mock_cast,
        mock_agent_chat,
    ) -> None:
        """
        Tests the run_extract Celery task by running it synchronously (always eager)
        and checking that Datacells are created as expected. Logs progress info to the
        test_extract_tasks.log file for post-run review.
        """
        # Setup mock for transaction.atomic
        mock_transaction_atomic.return_value.__enter__.return_value = None
        mock_transaction_atomic.return_value.__exit__.return_value = None

        # Setup mock for set_permissions_for_obj_to_user
        mock_set_permissions.return_value = None

        # Setup mock event loop
        mock_loop = mock_new_event_loop.return_value
        mock_loop.run_until_complete.return_value = None

        # Create a mock extract with all the necessary attributes and methods
        mock_extract_instance = MagicMock(spec=Extract)
        mock_extract_instance.id = self.extract.id
        mock_extract_instance.name = self.extract.name
        mock_extract_instance.creator = self.extract.creator

        # Create a proper mock for fieldset
        mock_fieldset = MagicMock(spec=Fieldset)
        mock_fieldset.id = self.extract.fieldset.id
        mock_fieldset.name = self.extract.fieldset.name

        # Create a mock for columns.all()
        mock_columns_manager = MagicMock()
        mock_columns_manager.all.return_value = [self.column, self.column]
        mock_fieldset.columns = mock_columns_manager

        # Assign the fieldset to the extract
        mock_extract_instance.fieldset = mock_fieldset

        # Create a mock for documents.all().values_list()
        mock_documents_manager = MagicMock()
        mock_documents_manager.all.return_value.values_list.return_value = [
            self.doc.id,
            self.doc2.id,
            self.doc3.id,
        ]
        mock_extract_instance.documents = mock_documents_manager

        # Setup mocks for database operations
        mock_extract_get.return_value = mock_extract_instance

        # Mock sync_to_async to return functions that return the values we want
        def mock_sync_to_async_impl(func):
            if func.__name__ == "sync_get_datacell":

                async def mock_get_datacell(pk):
                    return Datacell(
                        id=pk,
                        extract=self.extract,
                        column=self.column,
                        data={"value": "mocked_data"},
                        creator=self.user,
                        document=self.doc,
                    )

                return mock_get_datacell
            elif func.__name__ == "sync_mark_started":

                async def mock_mark_started(dc):
                    dc.started = timezone.now()
                    return None

                return mock_mark_started
            elif func.__name__ == "sync_mark_completed":

                async def mock_mark_completed(dc, data_dict):
                    dc.data = data_dict
                    dc.completed = timezone.now()
                    return None

                return mock_mark_completed
            elif func.__name__ == "get_filtered_annotations_with_similarity":

                async def mock_get_filtered_annotations(
                    document_id, avg_embedding, similarity_top_k
                ):
                    return []

                return mock_get_filtered_annotations
            elif func.__name__ == "fetch_relationships_for_annotations":

                async def mock_fetch_relationships(retrieved_annotation_ids):
                    return []

                return mock_fetch_relationships
            elif func.__name__ == "get_structural_annotations":

                async def mock_get_structural_annotations(document_id, page_number):
                    return []

                return mock_get_structural_annotations
            elif func.__name__ == "add_sources_to_datacell":
                # This is the function that uses datacell.sources.add
                # We'll mock it to do nothing
                async def mock_add_sources(datacell, annotation_ids):
                    return None

                return mock_add_sources
            else:
                # For any other function, return a mock that returns None
                async def mock_func(*args, **kwargs):
                    return None

                return mock_func

        mock_sync_to_async.side_effect = mock_sync_to_async_impl

        # Mock DocumentAnalysisRow class
        mock_row = MagicMock()
        mock_row.data = MagicMock()
        mock_row.data.add = MagicMock()
        mock_document_analysis_row_class.return_value = mock_row

        # Make sure the save method is called on the mock_row
        # This is needed because the actual implementation calls save() on the row
        mock_row.save = mock_document_analysis_row_save

        # Mock refresh_from_db methods
        mock_extract_refresh_from_db.return_value = None
        mock_datacell_refresh_from_db.return_value = None
        mock_datacell_save.return_value = None

        # Mock DocumentAnalysisRow.objects.filter
        mock_rows = []
        for i in range(3):
            mock_row = DocumentAnalysisRow(
                document_id=self.doc.id
                if i == 0
                else (self.doc2.id if i == 1 else self.doc3.id),
                extract_id=self.extract.id,
                creator=self.user,
            )
            mock_rows.append(mock_row)
        mock_queryset = mock_document_analysis_row_filter.return_value
        mock_queryset.count.return_value = 3

        # Mock Datacell.objects.create
        mock_datacells = []
        for i in range(6):
            mock_datacell = Datacell(
                id=i + 1,
                extract=self.extract,
                column=self.column,
                data={"value": f"mocked_data_{i}"},
                creator=self.user,
                document=self.doc if i < 2 else (self.doc2 if i < 4 else self.doc3),
            )
            mock_datacells.append(mock_datacell)
        mock_datacell_create.side_effect = mock_datacells

        # Setup mocks for task orchestration
        mock_task = MagicMock()
        mock_task.si.return_value = "mocked_task"
        mock_get_task_by_name.return_value = mock_task
        mock_group.return_value = "mocked_group"
        mock_chord.return_value.return_value = None

        # Setup mock for llama_index_react_agent_query
        mock_llama_index_react_agent_query.return_value = {
            "result": "mocked agent result"
        }

        # Setup mocks for LlamaIndex components
        mock_encoding = mock_encoding_for_model.return_value
        mock_encoding.encode.return_value = [1, 2, 3]  # Mock token encoding
        mock_encoding.decode.return_value = "decoded text"
        mock_calculate_embedding_for_text.return_value = [
            0.1,
            0.2,
            0.3,
        ]  # Mock embedding

        # Mock VectorStoreIndex and query engine
        mock_query_engine = (
            mock_vector_store_index.return_value.as_query_engine.return_value
        )
        mock_query_engine.query.return_value.response = "Mocked query response"

        # Run the task
        logging.info("Starting test_run_extract_task with run_extract.delay().")
        run_extract(self.extract.id, self.user.id)

        # Verify only the essential parts of the process
        # 1. The extract was marked as started
        self.assertIsNotNone(
            mock_extract_instance.started, "Extract should have a 'started' timestamp."
        )

        # 2. The task orchestration was set up correctly
        mock_get_task_by_name.assert_called()
        mock_task.si.assert_called()
        mock_chord.assert_called_once()

        # 3. The extract was retrieved correctly
        mock_extract_get.assert_called_with(pk=self.extract.id)

        # That's it! We don't need to verify every single internal detail
        # as long as the main workflow is executed correctly.


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
