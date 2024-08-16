from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db.models.signals import m2m_changed
from django.test import TestCase

from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.corpuses.signals import handle_document_added_to_corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Column, Extract, Fieldset
from opencontractserver.tasks.corpus_tasks import process_corpus_action

User = get_user_model()


@pytest.mark.django_db
class TestCorpusDocumentActions(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document", creator=self.user
        )
        self.task_based_analyzer = Analyzer.objects.create(
            description="Test Analyzer", creator=self.user, task_name="not.a.real.task"
        )
        self.gremlin_engine = GremlinEngine.objects.create(
            url="http://test-gremlin-engine.com", creator=self.user
        )
        # Create an Analyzer
        self.analyzer = Analyzer.objects.create(
            id="don't do a thing",
            description="Test Analyzer",
            creator=self.user,
            host_gremlin=self.gremlin_engine,
        )
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            name="Test Column",
            query="Test Query",
            output_type="str",
            creator=self.user,
        )

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_add_doc_signal(self, mock_task):

        self.corpus.documents.add(self.document)

        # Assert that the task was called with the correct arguments
        mock_task.assert_called_once_with(
            corpus_id=self.corpus.id,
            document_ids=[self.document.id],
            user_id=self.corpus.creator.id,
        )
        mock_task.return_value.apply_async.assert_called_once()

    def test_process_corpus_action_with_task_based_analyzer(self):
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.task_based_analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        with self.assertRaises(ValueError):
            process_corpus_action.si(
                self.corpus.id, [self.document.id], self.user.id
            ).apply()

    def test_process_corpus_action_with_analyzer(self):
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        process_corpus_action.si(
            self.corpus.id, [self.document.id], self.user.id
        ).apply()

        analyses = Analysis.objects.all()
        self.assertEqual(1, analyses.count())
        self.assertEqual(analyses[0].analyzed_corpus.id, self.corpus.id)
        self.assertEqual(analyses[0].analyzer.id, self.analyzer.id)

    def test_multiple_corpus_actions(self):

        CorpusAction.objects.create(
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        process_corpus_action.si(
            self.corpus.id, [self.document.id], self.user.id
        ).apply()

        analyses = Analysis.objects.all()
        self.assertEqual(1, analyses.count())
        self.assertEqual(analyses[0].analyzed_corpus.id, self.corpus.id)
        self.assertEqual(analyses[0].analyzer.id, self.analyzer.id)

        extracts = Extract.objects.all()
        self.assertEqual(1, extracts.count())
        self.assertEqual(extracts[0].corpus.id, self.corpus.id)
        self.assertEqual(extracts[0].fieldset.id, self.fieldset.id)

    def tearDown(self):
        m2m_changed.disconnect(
            handle_document_added_to_corpus, sender=Corpus.documents.through
        )
