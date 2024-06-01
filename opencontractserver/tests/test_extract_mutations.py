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
                    obj {
                        id
                        model
                    }
                }
            }
        """

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createLanguageModel"]["ok"])
        self.assertIsNotNone(result["data"]["createLanguageModel"]["obj"]["id"])
        self.assertEqual(
            result["data"]["createLanguageModel"]["obj"]["model"], "TestModel"
        )

    def test_create_fieldset_mutation(self):
        mutation = """
            mutation {
                createFieldset(name: "TestFieldset", description: "Test description") {
                    ok
                    obj {
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
        self.assertIsNotNone(result["data"]["createFieldset"]["obj"]["id"])
        self.assertEqual(
            result["data"]["createFieldset"]["obj"]["name"], "TestFieldset"
        )
        self.assertEqual(
            result["data"]["createFieldset"]["obj"]["description"],
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
                    obj {{
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
        self.assertIsNotNone(result["data"]["createColumn"]["obj"]["id"])
        self.assertEqual(result["data"]["createColumn"]["obj"]["query"], "TestQuery")
        self.assertEqual(result["data"]["createColumn"]["obj"]["outputType"], "str")
        self.assertEqual(result["data"]["createColumn"]["obj"]["agentic"], False)

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
                    obj {{
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
            self.assertIsNotNone(result["data"]["startExtract"]["obj"]["id"])
            self.assertEqual(
                result["data"]["startExtract"]["obj"]["name"], "TestExtract"
            )
            mock_task.assert_called_once()
