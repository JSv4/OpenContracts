import difflib

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.llms.tools.core_tools import update_corpus_description

User = get_user_model()


class CorpusPatchToolTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("cuser", password="pw")
        self.corpus = Corpus.objects.create(title="Patch C", creator=self.user)
        # start description
        update_corpus_description(
            corpus_id=self.corpus.id,
            new_content="# H1\n\nInitial",
            author_id=self.user.id,
        )

    def test_patch(self):
        current = self.corpus._read_md_description_content()
        new_md = "# H1\n\nChanged"
        diff_text = "".join(
            difflib.ndiff(
                current.splitlines(keepends=True), new_md.splitlines(keepends=True)
            )
        )
        rev = update_corpus_description(
            corpus_id=self.corpus.id,
            diff_text=diff_text,
            author_id=self.user.id,
        )
        self.assertIsNotNone(rev)
        self.corpus.refresh_from_db()
        updated = self.corpus._read_md_description_content()
        self.assertEqual(updated, new_md)
