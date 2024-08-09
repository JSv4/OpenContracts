from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.analyzer.models import Analyzer
from opencontractserver.extracts.models import Fieldset

User = get_user_model()

class CorpusActionModelTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.corpus = Corpus.objects.create(title='Test Corpus', creator=self.user)
        self.analyzer = Analyzer.objects.create(description='Test Analyzer', creator=self.user, task_name="not.a.real.task")
        self.fieldset = Fieldset.objects.create(name='Test Fieldset', creator=self.user)

    def test_create_corpus_action_with_analyzer(self):
        corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        self.assertIsNotNone(corpus_action.id)
        self.assertEqual(corpus_action.corpus, self.corpus)
        self.assertEqual(corpus_action.analyzer, self.analyzer)
        self.assertIsNone(corpus_action.fieldset)
        self.assertEqual(corpus_action.trigger, CorpusActionTrigger.ADD_DOCUMENT)

    def test_create_corpus_action_with_fieldset(self):
        corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.EDIT_DOCUMENT,
            creator=self.user
        )
        self.assertIsNotNone(corpus_action.id)
        self.assertEqual(corpus_action.corpus, self.corpus)
        self.assertEqual(corpus_action.fieldset, self.fieldset)
        self.assertIsNone(corpus_action.analyzer)
        self.assertEqual(corpus_action.trigger, CorpusActionTrigger.EDIT_DOCUMENT)

    def test_create_corpus_action_with_both_analyzer_and_fieldset(self):
        with self.assertRaises(ValidationError):
            CorpusAction.objects.create(
                corpus=self.corpus,
                analyzer=self.analyzer,
                fieldset=self.fieldset,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                creator=self.user
            )

    def test_create_corpus_action_without_analyzer_or_fieldset(self):
        with self.assertRaises(ValidationError):
            CorpusAction.objects.create(
                corpus=self.corpus,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                creator=self.user
            )

    def test_corpus_action_str_representation(self):
        corpus_action_analyzer = CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        expected_str_analyzer = f"CorpusAction for {self.corpus} - Analyzer - Add Document"
        self.assertEqual(str(corpus_action_analyzer), expected_str_analyzer)

        corpus_action_fieldset = CorpusAction.objects.create(
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.EDIT_DOCUMENT,
            creator=self.user
        )
        expected_str_fieldset = f"CorpusAction for {self.corpus} - Fieldset - Edit Document"
        self.assertEqual(str(corpus_action_fieldset), expected_str_fieldset)

    def test_corpus_action_trigger_choices(self):
        self.assertEqual(CorpusActionTrigger.ADD_DOCUMENT, 'add_document')
        self.assertEqual(CorpusActionTrigger.EDIT_DOCUMENT, 'edit_document')

    def test_corpus_action_related_name(self):
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        CorpusAction.objects.create(
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.EDIT_DOCUMENT,
            creator=self.user
        )
        self.assertEqual(self.corpus.actions.count(), 2)

    def test_corpus_action_creator(self):
        corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        self.assertEqual(corpus_action.creator, self.user)

    def test_corpus_action_creation_time(self):
        corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        self.assertIsNotNone(corpus_action.created)
        self.assertIsNotNone(corpus_action.modified)

    def test_corpus_action_modification_time(self):
        corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user
        )
        original_modified = corpus_action.modified
        corpus_action.trigger = CorpusActionTrigger.EDIT_DOCUMENT
        corpus_action.save()
        self.assertNotEqual(corpus_action.modified, original_modified)
