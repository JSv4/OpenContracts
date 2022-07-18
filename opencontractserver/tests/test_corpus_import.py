import pathlib

from django.contrib.auth import get_user_model

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks.utils import package_zip_into_base64
from opencontractserver.utils.import_utils import build_import_corpus_task

User = get_user_model()


class ImportCorpusTestCase:

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="12345678")

    def test_import(self):

        print(
            "# TEST CORPUS IMPORT PIPELINE #########################################################################"
        )

        print("1)\tLoad test zip into base64 string")
        export_zip_base64_file_string = package_zip_into_base64(
            self.fixtures_path / "Test_Corpus_EXPORT.zip"
        )
        print("\t\tLOADED")

        print("2)\tCreate seed corpus to import data into...")
        corpus_obj = Corpus.objects.create(
            title="New Import", creator=self.user, backend_lock=False
        )
        print("\t\tCREATED")

        print("3)\tBuild celery task to import")
        import_task = build_import_corpus_task(
            seed_corpus_id=corpus_obj.id,
            base_64_file_string=export_zip_base64_file_string,
            user=self.user,
        )
        print("\t\tBUILT")

        print("4)\tRun the celery task...")
        import_results = import_task.apply().get()
        assert isinstance(import_results, str)
        print("\t\tCOMPLETED")

        # TODO - these are clearly not actually working... properly hook into test suite once you have internet access.
        labels = AnnotationLabel.objects.all()
        assert labels.count() == 2

        corpuses = Corpus.objects.all()
        assert corpuses.count() == 1

        annotations = Annotation.objects.all()
        assert annotations.count() == 2

        documents = Document.objects.all()
        assert documents.count() == 2

        # TODO - check the integrity of the corpus itself
