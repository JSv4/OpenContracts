import vcr
from django.test.utils import override_settings
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from unittest.mock import patch

from opencontractserver.analyzer.models import Analysis, Analyzer
from opencontractserver.documents.models import Document
from opencontractserver.annotations.models import Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks.doc_analysis_tasks import build_contract_knowledge_base
from opencontractserver.tests.base import BaseFixtureTestCase


class TestBuildContractKnowledgeBaseTask(BaseFixtureTestCase):
    """
    Tests the build_contract_knowledge_base task which uses GPT-based
    logic to generate contract summaries and create notes containing references.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_build_contract_knowledge_base.yaml",
        filter_headers=["authorization"]
    )
    def test_build_contract_knowledge_base(self) -> None:
        """
        Ensures that build_contract_knowledge_base successfully updates
        the Document with a summary file, a description, and creates
        relevant Notes (e.g. 'Referenced Documents' and 'Quick Reference').
        """

        # Create or fetch our test Document (from BaseFixtureTestCase or newly minted),
        # linking it to a newly created Corpus for test isolation.
        test_corpus = Corpus.objects.create(title="KnowledgeBase Corpus", creator=self.user)
        doc = Document.objects.create(
            creator=self.user,
            title="TaskTestDoc",
            description="Initial description",
            pdf_file=ContentFile(b"Fake PDF bytes for testing", name="test_file.pdf"),
            backend_lock=True,
        )

        # Create analyzer with required fields
        self.task_name_analyzer = Analyzer.objects.create(
            id="test.analyzer.1",  # Required primary key
            description="Test description",
            creator=self.user,
            task_name="test_analyzer",  # Either task_name or host_gremlin must be set
        )
        
        self.analysis = Analysis.objects.create(
            analyzer=self.task_name_analyzer,
            analyzed_corpus=self.corpus,
            creator=self.user,
        )

        # Run the build_contract_knowledge_base task synchronously.
        task_result = build_contract_knowledge_base.delay(
            doc_id=doc.id,
            corpus_id=test_corpus.id,
            analysis_id=self.analysis.id,
        ).get()  # .get() ensures we wait for task completion in eager mode

        # Refresh the doc from DB
        doc.refresh_from_db()

        # Verify the Celery task signaled success
        self.assertEqual(task_result, ([], [], [], True))

        # Assert that the doc has been updated with a new summary file and an updated description
        self.assertIsNotNone(doc.md_summary_file, "Expected md_summary_file to be created.")
        self.assertNotEqual(doc.description, "Initial description", "Expected doc description to be updated.")

        # Check that the relevant notes have been created
        referenced_docs_note = Note.objects.filter(document=doc, title="Referenced Documents").first()
        quick_ref_note = Note.objects.filter(document=doc, title="Quick Reference").first()

        self.assertIsNotNone(
            referenced_docs_note,
            "Expected a 'Referenced Documents' note to be created for the document."
        )
        self.assertIsNotNone(
            quick_ref_note,
            "Expected a 'Quick Reference' note to be created for the document."
        )

        print("build_contract_knowledge_base task test completed successfully.") 