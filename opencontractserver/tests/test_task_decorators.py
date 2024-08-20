from celery.exceptions import Retry
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.analyzer.models import Analysis, Analyzer
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.decorators import doc_analyzer_task
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_ONE_PATH
from opencontractserver.types.dicts import TextSpan

User = get_user_model()


@doc_analyzer_task(max_retries=10)
def sample_task(*args, **kwargs):
    return (
        ["IMPORTANT_DOCUMENT"],
        [
            (
                TextSpan(id="1", start=0, end=29, text="This is a sample PDF document"),
                "IMPORTANT!",
            )
        ],
        [{"data": {"processed": True}}],
        True,
    )


class DocAnalyzerTaskTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )

        # Create a real Document instance
        self.document = Document.objects.create(
            title="Test Document",
            description="A test document",
            pdf_file=ContentFile(b"dummy pdf content", name="test.pdf"),
            txt_extract_file=ContentFile(
                b"This is a sample PDF document.", name="test.txt"
            ),
            pawls_parse_file=ContentFile(
                b'[{"page": {"width": 612, "height": 792, "index": 0}, "tokens": [{"x": 72, "y": 72, "width": 50, '
                b'"height": 12, "text": "This"}, {"x": 130, "y": 72, "width": 20, "height": 12, "text": "is"}, '
                b'{"x": 158, "y": 72, "width": 40, "height": 12, "text": "a"}, {"x": 206, "y": 72, "width": 60, '
                b'"height": 12, "text": "sample"}, {"x": 274, "y": 72, "width": 50, "height": 12, "text": "PDF"}, '
                b'{"x": 332, "y": 72, "width": 80, "height": 12, "text": "document."}]}]',
                name="test_pawls.json",
            ),
            backend_lock=True,
            creator=self.user,
        )

        self.unlocked_document = Document.objects.create(
            title="Test Document 2",
            description="A test document",
            pdf_file=ContentFile(b"dummy pdf content", name="test.pdf"),
            txt_extract_file=ContentFile(
                b"This is a sample PDF document.", name="test.txt"
            ),
            pawls_parse_file=ContentFile(
                b'[{"page": {"width": 612, "height": 792, "index": 0}, "tokens": [{"x": 72, "y": 72, "width": 50, '
                b'"height": 12, "text": "This"}, {"x": 130, "y": 72, "width": 20, "height": 12, "text": "is"}, '
                b'{"x": 158, "y": 72, "width": 40, "height": 12, "text": "a"}, {"x": 206, "y": 72, "width": 60, '
                b'"height": 12, "text": "sample"}, {"x": 274, "y": 72, "width": 50, "height": 12, "text": "PDF"}, '
                b'{"x": 332, "y": 72, "width": 80, "height": 12, "text": "document."}]}]',
                name="test_pawls.json",
            ),
            backend_lock=False,
            creator=self.user,
        )

        # Create a real Corpus instance
        self.corpus = Corpus.objects.create(
            title="Test Corpus", description="A test corpus", creator=self.user
        )

        self.task_name_analyzer = Analyzer(
            description="Valid Analyzer with Task",
            task_name="opencontractserver.tasks.data_extract_tasks.oc_llama_index_doc_query",
            creator=self.user,
            manifest={},
        )
        self.task_name_analyzer.save()

        self.analysis = Analysis(
            analyzer_id=self.task_name_analyzer.id,
            analyzed_corpus_id=self.corpus.id,
            creator=self.user,
        )
        self.analysis.save()

    def test_doc_analyzer_task_backend_lock_retry_cycle(self):
        with self.assertRaises(Retry):
            task = sample_task.s(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply()
            task.get()

    def test_doc_analyzer_task_no_backend_lock(self):
        task = sample_task.si(
            doc_id=self.unlocked_document.id, analysis_id=self.analysis.id
        ).apply()
        results = task.get()
        print(results)
        self.assertEqual(
            (
                ["IMPORTANT_DOCUMENT"],
                [
                    (
                        TextSpan(
                            id="1",
                            start=0,
                            end=29,
                            text="This is a sample PDF document",
                        ),
                        "IMPORTANT!",
                    )
                ],
                [{"data": {"processed": True}}],
                True,
            ),
            results,
        )

    def test_doc_analyzer_task_missing_doc_id(self):
        with self.assertRaisesRegex(
            ValueError, "doc_id is required for doc_analyzer_task"
        ):
            sample_task.si().apply().get()

    def test_doc_analyzer_task_nonexistent_document(self):
        non_existent_id = self.document.id + 1000  # Ensure this ID doesn't exist
        with self.assertRaisesRegex(
            ValueError, f"Document with id {non_existent_id} does not exist"
        ):
            sample_task.si(
                doc_id=non_existent_id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_nonexistent_corpus(self):
        non_existent_corpus_id = self.corpus.id + 1000  # Ensure this ID doesn't exist
        with self.assertRaisesRegex(
            ValueError, f"Corpus with id {non_existent_corpus_id} does not exist"
        ):
            sample_task.si(
                doc_id=self.document.id,
                analysis_id=self.analysis.id,
                corpus_id=non_existent_corpus_id,
            ).apply().get()

    def test_doc_analyzer_task_invalid_return_value(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def invalid_return_task(*args, **kwargs):
            return "Invalid return value"

        with self.assertRaisesRegex(ValueError, "Function must return a tuple"):
            invalid_return_task.s(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_invalid_return_tuple_length(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def invalid_return_task(*args, **kwargs):
            return [], []

        with self.assertRaisesRegex(ValueError, "Function must return a tuple"):
            invalid_return_task.s(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_invalid_annotation(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def invalid_annotation_task(*args, **kwargs):
            return "Not a list", [], [{"data": {}}], True

        with self.assertRaisesRegex(
            ValueError, "First element of the tuple must be a list of doc labels"
        ):
            invalid_annotation_task.si(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_invalid_text_annotations(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task(max_retries=10)
        def invalid_text_annotations_task(*args, **kwargs):
            return [], "Not a list", [{"data": {}}], True

        with self.assertRaisesRegex(
            ValueError,
            "Second element of the tuple must be"
        ):
            invalid_text_annotations_task.si(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_invalid_metadata(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def invalid_metadata_task(*args, **kwargs):
            return [], [], "Not a list", True

        with self.assertRaisesRegex(
            ValueError,
            "Third element of the tuple must be a list of dictionaries with 'data' key",
        ):
            invalid_metadata_task.si(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_invalid_text_annotation_schema(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def invalid_text_annotation_schema_task(*args, **kwargs):
            return [], [{"random_key": "I am lazy", "wishlist?": "RTFD"}], [], True

        with self.assertRaisesRegex(ValueError, "Second element of the tuple must be"):
            invalid_text_annotation_schema_task.si(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()

    def test_doc_analyzer_task_missing_data_key(self):
        self.document.backend_lock = False
        self.document.save()

        @doc_analyzer_task()
        def missing_data_key_task(*args, **kwargs):
            return [], [], [{"not_data": {}}], True

        with self.assertRaisesRegex(
            ValueError,
            "Third element of the tuple must be a list of dictionaries with "
            "'data' key",
        ):
            missing_data_key_task.si(
                doc_id=self.document.id, analysis_id=self.analysis.id
            ).apply().get()
