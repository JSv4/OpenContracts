import difflib

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.core.files.base import ContentFile

from opencontractserver.annotations.models import Note
from opencontractserver.documents.models import Document
from opencontractserver.corpuses.models import Corpus
from opencontractserver.llms.tools.core_tools import update_document_note

User = get_user_model()


class NotePatchToolTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("patcher", password="pw")
        self.corpus = Corpus.objects.create(title="Patch Corpus", creator=self.user)
        self.doc = Document.objects.create(creator=self.user, title="Doc")
        self.doc.save()

        self.note = Note.objects.create(
            document=self.doc,
            title="Patch Note",
            content="Line1\nLine2\n",
            creator=self.user,
        )

    def test_patch_applies_version_up(self):
        original = self.note.content
        new = "Line1\nEdited\n"
        diff_lines = difflib.ndiff(
            original.splitlines(keepends=True), new.splitlines(keepends=True)
        )
        diff_text = "".join(diff_lines)

        rev = update_document_note(
            note_id=self.note.id,
            diff_text=diff_text,
            author_id=self.user.id,
        )

        self.assertIsNotNone(rev)
        self.note.refresh_from_db()
        self.assertEqual(self.note.content, new)
        self.assertEqual(self.note.revisions.count(), 2)

    def test_error_when_both_params(self):
        with self.assertRaises(ValueError):
            update_document_note(
                note_id=self.note.id,
                new_content="foo",
                diff_text="bar",
                author_id=self.user.id,
            ) 