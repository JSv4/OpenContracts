from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.extracts.models import Fieldset, LanguageModel

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsMutationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

        self.corpus = Corpus.objects.create(title="TestCorpus", creator=self.user)

    def test_create_language_model_mutation(self):
        mutation = """
            mutation {
                createLanguageModel(model: "TestModel") {
                    ok
                    languageModel {
                        id
                        model
                    }
                }
            }
        """

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createLanguageModel"]["ok"])
        self.assertIsNotNone(
            result["data"]["createLanguageModel"]["languageModel"]["id"]
        )
        self.assertEqual(
            result["data"]["createLanguageModel"]["languageModel"]["model"], "TestModel"
        )

    def test_create_fieldset_mutation(self):
        mutation = """
            mutation {
                createFieldset(name: "TestFieldset", description: "Test description") {
                    ok
                    fieldset {
                        id
                        name
                        description
                    }
                }
            }
        """

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createFieldset"]["ok"])
        self.assertIsNotNone(result["data"]["createFieldset"]["fieldset"]["id"])
        self.assertEqual(
            result["data"]["createFieldset"]["fieldset"]["name"], "TestFieldset"
        )
        self.assertEqual(
            result["data"]["createFieldset"]["fieldset"]["description"],
            "Test description",
        )

    def test_create_column_mutation(self):
        language_model = LanguageModel.objects.create(
            model="TestModel", creator=self.user
        )
        fieldset = Fieldset.objects.create(
            owner=self.user,
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )

        mutation = """
            mutation {{
                createColumn(
                    fieldsetId: "{}",
                    query: "TestQuery",
                    outputType: "str",
                    languageModelId: "{}",
                    agentic: false
                ) {{
                    ok
                    column {{
                        id
                        query
                        outputType
                        agentic
                    }}
                }}
            }}
        """.format(
            to_global_id("FieldsetType", fieldset.id),
            to_global_id("LanguageModelType", language_model.id),
        )

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createColumn"]["ok"])
        self.assertIsNotNone(result["data"]["createColumn"]["column"]["id"])
        self.assertEqual(result["data"]["createColumn"]["column"]["query"], "TestQuery")
        self.assertEqual(result["data"]["createColumn"]["column"]["outputType"], "str")
        self.assertEqual(result["data"]["createColumn"]["column"]["agentic"], False)

    def test_start_extract_mutation(self):
        fieldset = Fieldset.objects.create(
            owner=self.user,
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )

        mutation = """
            mutation {{
                startExtract(
                    corpusId: "{}",
                    name: "TestExtract",
                    fieldsetId: "{}"
                ) {{
                    ok
                    extract {{
                        id
                        name
                    }}
                }}
            }}
        """.format(
            to_global_id("CorpusType", self.corpus.id),
            to_global_id("FieldsetType", fieldset.id),
        )

        with patch(
            "opencontractserver.tasks.extract_tasks.run_extract.delay"
        ) as mock_task:
            result = self.client.execute(mutation)
            self.assertIsNone(result.get("errors"))
            self.assertTrue(result["data"]["startExtract"]["ok"])
            self.assertIsNotNone(result["data"]["startExtract"]["extract"]["id"])
            self.assertEqual(
                result["data"]["startExtract"]["extract"]["name"], "TestExtract"
            )
            mock_task.assert_called_once()
