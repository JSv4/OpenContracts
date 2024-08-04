from django.contrib.auth import get_user_model
from django.test import TestCase
from opencontractserver.documents.models import Document
from opencontractserver.corpuses.models import Corpus

from celery.exceptions import MaxRetriesExceededError

from opencontractserver.shared.decorators import doc_analyzer_task

User = get_user_model()


@doc_analyzer_task(max_retries=10)
def sample_task(doc_id, corpus_id=None):
    return ([{"id": 1, "annotationLabel": "test", "rawText": "text", "page": 1, "annotation_json": {}}],
            [{"data": {"processed": True}}], True)


class DocAnalyzerTaskTestCase(TestCase):
    def setUp(self):

        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )

        # Create a real Document instance
        self.document = Document.objects.create(
            title="Test Document",
            description="A test document",
            backend_lock=True,
            creator=self.user
        )
        self.unlocked_document = Document.objects.create(
            title="Test Document 2",
            description="A test document",
            backend_lock=False,
            creator=self.user
        )

        # Create a real Corpus instance
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="A test corpus",
            creator=self.user
        )

    def test_doc_analyzer_task_backend_lock_retry_cycle(self):
        with self.assertRaises(MaxRetriesExceededError):
            task = sample_task.s(doc_id=self.document.id).apply()
            task.get()

    def test_doc_analyzer_task_no_backend_lock(self):
        task = sample_task.si(doc_id=self.unlocked_document.id).apply()
        results = task.get()
        print(results)
        self.assertEqual(
            ([{"id": 1, "annotationLabel": "test", "rawText": "text", "page": 1, "annotation_json": {}}],
             [{"data": {"processed": True}}], True),
            results
        )

    def test_doc_analyzer_task_missing_doc_id(self):
        with self.assertRaisesRegex(ValueError, "doc_id is required for doc_analyzer_task"):
            sample_task.si().apply().get()

    def test_doc_analyzer_task_nonexistent_document(self):
        non_existent_id = self.document.id + 1000  # Ensure this ID doesn't exist
        with self.assertRaisesRegex(ValueError, f"Document with id {non_existent_id} does not exist"):
            sample_task.si(doc_id=999).apply().get()

    def test_doc_analyzer_task_nonexistent_corpus(self):
        non_existent_corpus_id = self.corpus.id + 1000  # Ensure this ID doesn't exist
        with self.assertRaisesRegex(ValueError, f"Corpus with id {non_existent_corpus_id} does not exist"):
            sample_task.si(doc_id=self.document.id, corpus_id=-1).apply().get()

    def test_doc_analyzer_task_invalid_return_value(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task
        def invalid_return_task(doc_id, corpus_id=None):
            return "Invalid return value"

        with self.assertRaisesRegex(ValueError, "Function must return a tuple"):
            invalid_return_task.s(doc_id=self.document.id).apply().get()

    def test_doc_analyzer_task_invalid_annotation(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task
        def invalid_annotation_task(doc_id, corpus_id=None):
            return "Not a list", [{"data": {}}], True

        with self.assertRaisesRegex(ValueError, "First element of the tuple must be a list"):
            invalid_annotation_task.si(doc_id=self.document.id).apply().get()

    def test_doc_analyzer_task_invalid_metadata(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task
        def invalid_metadata_task(doc_id, corpus_id=None):
            return [], "Not a list", True

        with self.assertRaisesRegex(ValueError, "Second element of the tuple must be a list"):
            invalid_metadata_task.si(doc_id=self.document.id).apply().get()

    def test_doc_analyzer_task_missing_data_key(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task
        def missing_data_key_task(doc_id, corpus_id=None):
            return [], [{"not_data": {}}], True

        with self.assertRaisesRegex(ValueError,
                                    "Second element of the tuple must be a list of dictionaries with 'data' key"):
            missing_data_key_task.si(doc_id=self.document.id).apply().get()
