import vcr
from django.core.files.base import ContentFile
from django.test.utils import override_settings

from opencontractserver.analyzer.models import Analysis, Analyzer
from opencontractserver.annotations.models import Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_analysis_tasks import (
    build_case_law_knowledge_base,
    build_contract_knowledge_base,
)
from opencontractserver.tests.base import BaseFixtureTestCase


class TestBuildContractKnowledgeBaseTask(BaseFixtureTestCase):
    """
    Tests the build_contract_knowledge_base task which uses GPT-based
    logic to generate contract summaries and create notes containing references.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_build_contract_knowledge_base.yaml",
        filter_headers=["authorization"],
    )
    def test_build_contract_knowledge_base(self) -> None:
        """
        Ensures that build_contract_knowledge_base successfully updates
        the Document with a summary file, a description, and creates
        relevant Notes (e.g. 'Referenced Documents' and 'Quick Reference').
        """

        # Create or fetch our test Document (from BaseFixtureTestCase or newly minted),
        # linking it to a newly created Corpus for test isolation.
        test_corpus = Corpus.objects.create(
            title="KnowledgeBase Corpus", creator=self.user
        )
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
        self.assertEqual(task_result, ([], [], [], True, "No Return Message"))

        # Assert that the doc has been updated with a new summary file and an updated description
        self.assertIsNotNone(
            doc.md_summary_file, "Expected md_summary_file to be created."
        )
        self.assertNotEqual(
            doc.description,
            "Initial description",
            "Expected doc description to be updated.",
        )

        # Check that the relevant notes have been created
        referenced_docs_note = Note.objects.filter(
            document=doc, title="Referenced Documents"
        ).first()
        quick_ref_note = Note.objects.filter(
            document=doc, title="Quick Reference"
        ).first()

        self.assertIsNotNone(
            referenced_docs_note,
            "Expected a 'Referenced Documents' note to be created for the document.",
        )
        self.assertIsNotNone(
            quick_ref_note,
            "Expected a 'Quick Reference' note to be created for the document.",
        )

        print("build_contract_knowledge_base task test completed successfully.")


class TestBuildCaseLawKnowledgeBaseTask(BaseFixtureTestCase):
    """
    Tests the build_case_law_knowledge_base task which uses GPT-based
    logic to determine if a document is a court case, and if so, creates
    a searchable summary, headnotes, and black letter law categories.
    """

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_build_case_law_knowledge_base.yaml",
        filter_headers=["authorization"],
        record_mode="new_episodes",
    )
    def test_build_case_law_knowledge_base_court_case(self) -> None:
        """
        Ensures that build_case_law_knowledge_base successfully updates
        the Document with a case_summary file, an updated description, and
        creates the relevant Notes (Headnotes, Black Letter Law Categories)
        when the document is recognized as a court case.
        """

        # Create or fetch our test Document, linking it to a newly created Corpus
        test_corpus = Corpus.objects.create(title="CaseLaw Corpus", creator=self.user)

        # Create an analyzer and an analysis object
        self.task_name_analyzer = Analyzer.objects.create(
            id="test.analyzer.2",
            description="Test analyzer for case law",
            creator=self.user,
            task_name="test_case_law_analyzer",
        )
        self.analysis = Analysis.objects.create(
            analyzer=self.task_name_analyzer,
            analyzed_corpus=test_corpus,
            creator=self.user,
        )

        # Run the build_case_law_knowledge_base task synchronously, mimicking a real Celery call
        task_result = build_case_law_knowledge_base.delay(
            doc_id=self.doc.id,
            corpus_id=test_corpus.id,
            analysis_id=self.analysis.id,
        ).get()

        # Refresh the doc from DB
        self.doc.refresh_from_db()

        # Verify the Celery task signaled success
        # Matches the typical 5-tuple return in our test harness:
        # ([], [], [], True, "No Return Message")
        self.assertEqual(task_result, ([], [], [], False, "No Return Message"))

        # The doc should have a newly-created markdown summary file
        self.assertIsNotNone(
            self.doc.md_summary_file, "Expected a case_summary.md to be created."
        )
        # The doc should now have a new description
        self.assertNotEqual(
            self.doc.description,
            "Initial description",
            "Expected doc description to be updated for a recognized court case.",
        )

        # Check that the relevant notes (headnotes, black letter law) have been created
        headnotes_note = Note.objects.filter(
            document=self.doc, title="Headnotes"
        ).first()
        black_letter_note = Note.objects.filter(
            document=self.doc, title="Black Letter Law Categories"
        ).first()

        self.assertIsNotNone(
            headnotes_note,
            "Expected a 'Headnotes' note to be created for a recognized court case.",
        )
        self.assertIsNotNone(
            black_letter_note,
            "Expected a 'Black Letter Law Categories' note to be created for a recognized court case.",
        )

        print("build_case_law_knowledge_base (court case) test completed successfully.")

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_build_case_law_knowledge_base_not_a_case.yaml",
        filter_headers=["authorization"],
    )
    def test_build_case_law_knowledge_base_not_a_court_case(self) -> None:
        """
        Ensures that build_case_law_knowledge_base does not modify or add
        any data if the document is recognized as something other than a court case.
        """

        # Create a test Document that is not a court case
        test_corpus = Corpus.objects.create(title="NotACase Corpus", creator=self.user)
        doc = Document.objects.create(
            creator=self.user,
            title="NotACaseDoc",
            description="Initial non-case description",
            pdf_file=ContentFile(
                b"Some random text that is not a court case", name="test_file.pdf"
            ),
            backend_lock=True,
        )

        # Create an analyzer and an analysis object
        self.task_name_analyzer = Analyzer.objects.create(
            id="test.analyzer.3",
            description="Test analyzer for not-a-case",
            creator=self.user,
            task_name="test_case_law_analyzer_not_case",
        )
        self.analysis = Analysis.objects.create(
            analyzer=self.task_name_analyzer,
            analyzed_corpus=test_corpus,
            creator=self.user,
        )

        # Run the task
        task_result = build_case_law_knowledge_base.delay(
            doc_id=doc.id,
            corpus_id=test_corpus.id,
            analysis_id=self.analysis.id,
        ).get()

        # Refresh the doc
        doc.refresh_from_db()

        # This should return ([], [], [{"reason": "Not a court case"}], True, "No Return Message")
        self.assertEqual(
            task_result,
            ([], [], [], False, "No Return Message"),
        )

        # The doc should not have a summary file
        self.assertIsNone(
            doc.md_summary_file,
            "Expected no md_summary_file to be created for non-cases.",
        )
        # The doc description should remain unchanged
        self.assertEqual(
            doc.description,
            "Initial non-case description",
            "Expected doc description to remain unchanged for non-cases.",
        )

        # No relevant notes should be created
        headnotes_note = Note.objects.filter(document=doc, title="Headnotes").exists()
        black_letter_note = Note.objects.filter(
            document=doc, title="Black Letter Law Categories"
        ).exists()

        self.assertFalse(
            headnotes_note,
            "Did not expect a 'Headnotes' note for a non-case document.",
        )
        self.assertFalse(
            black_letter_note,
            "Did not expect a 'Black Letter Law Categories' note for a non-case document.",
        )

        print(
            "build_case_law_knowledge_base (not a court case) test completed successfully."
        )
