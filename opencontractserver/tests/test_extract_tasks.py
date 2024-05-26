import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.extracts.models import (
    Column,
    Extract,
    Fieldset,
    LanguageModel,
    Row,
)
from opencontractserver.tasks.extract_tasks import run_extract

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsTaskTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )

        self.language_model = LanguageModel.objects.create(model="TestModel")
        self.fieldset = Fieldset.objects.create(
            owner=self.user, name="TestFieldset", description="Test description"
        )
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            query="TestQuery",
            output_type="str",
            language_model=self.language_model,
            agentic=False,
        )
        self.corpus = Corpus.objects.create(title="TestCorpus", creator=self.user)
        self.extract = Extract.objects.create(
            corpus=self.corpus,
            name="TestExtract",
            fieldset=self.fieldset,
            owner=self.user,
        )

    @patch("opencontractserver.tasks.extract_tasks.agent_fetch_my_definitions")
    @patch("opencontractserver.tasks.extract_tasks.extract_for_query")
    def test_run_extract_task(
        self, mock_extract_for_query, mock_agent_fetch_my_definitions
    ):
        mock_extract_for_query.return_value = "Mocked extracted data"
        mock_agent_fetch_my_definitions.return_value = []

        run_extract(self.extract.id, self.user.id)

        self.extract.refresh_from_db()
        self.assertIsNotNone(self.extract.started)

        row = Row.objects.filter(extract=self.extract, column=self.column).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.data, json.dumps({"data": "Mocked extracted data"}))
        self.assertEqual(row.data_definition, "str")
        self.assertIsNotNone(row.started)
        self.assertIsNotNone(row.completed)

        mock_extract_for_query.assert_called_once()
        mock_agent_fetch_my_definitions.assert_called_once()
