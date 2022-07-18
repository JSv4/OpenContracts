import pathlib

from django.contrib.auth import get_user_model

from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks.utils import package_zip_into_base64
from opencontractserver.utils.fork_utils import build_fork_corpus_task
from opencontractserver.utils.import_utils import build_import_corpus_task

User = get_user_model()


class CorpusForkTestCase:

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="12345678")

    def test_corpus_forking(self):

        """
        Test that we can fork an imported corpus
        """

        print(
            "# TEST CORPUS FORK PIPELINE #########################################################################"
        )

        print("1)\tCreate a test corpus to fork")
        export_zip_base64_file_string = package_zip_into_base64(
            self.fixtures_path / "Test_Corpus_EXPORT.zip"
        )
        original_corpus_obj = Corpus.objects.create(
            title="New Import", creator=self.user, backend_lock=False
        )
        import_task = build_import_corpus_task(
            seed_corpus_id=original_corpus_obj.id,
            base_64_file_string=export_zip_base64_file_string,
            user=self.user,
        )
        import_task.apply().get()
        print("\t\tCOMPLETED")

        print("2)\tBuild the import task...")
        fork_task = build_fork_corpus_task(
            corpus_pk_to_fork=original_corpus_obj.id, user=self.user
        )
        print("\t\tBUILT")

        print("3)\tRun the import task...")
        task_results = fork_task.apply().get()
        print("\t\tCOMPLETED")

        forked_corpus = Corpus.objects.get(id=task_results)

        print("4)\tMake sure we were able to get corpus obj...")
        assert isinstance(forked_corpus, Corpus)
        print("\t\tSUCCESS")

        print("5)\tMake sure the forked object has a parent...")
        assert isinstance(forked_corpus.parent, Corpus)
        print("\t\tSUCCESS")

        print("6)\tMake sure the forked corpus has same annotations")
        assert (
            forked_corpus.parent.annotation_set.all().count()
            == original_corpus_obj.annotation_set.all().count()
        )
        print("\t\tSUCCESS")

        print("7)\tMake sure the document count is the same")
        assert (
            forked_corpus.documents.all().count()
            == original_corpus_obj.documents.all().count()
        )
        print("\t\tSUCCESS")

        print("8)\tMake sure the labelset label counts are the same")
        original_labelset_labels = original_corpus_obj.label_set.annotation_labels.all()
        forked_labelset_labels = forked_corpus.label_set.annotation_labels.all()
        assert forked_labelset_labels.count() == original_labelset_labels.all()
        print("\t\tSUCCESS")

        # TODO - improve tests to actually check data integrity of cloned objs...
