from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Extract, Fieldset

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

        self.fieldset = Fieldset.objects.create(
            name="TestFieldset", description="Test description", creator=self.user
        )
        self.extract = Extract.objects.create(
            name="TestExtract",
            fieldset=self.fieldset,
            creator=self.user,
        )
        self.corpus = Corpus.objects.create(title="TestCorpus", creator=self.user)
        self.document1 = Document.objects.create(
            title="TestDocument1",
            description="Test Description 1",
            pdf_file="path/to/file1.pdf",
            creator=self.user,
        )
        self.document2 = Document.objects.create(
            title="TestDocument2",
            description="Test Description 2",
            pdf_file="path/to/file2.pdf",
            creator=self.user,
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
        fieldset = Fieldset.objects.create(
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )

        mutation = """
            mutation {{
                createColumn(
                    name: "BIAD"
                    fieldsetId: "{}",
                    query: "TestQuery",
                    outputType: "str",
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
        )

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createColumn"]["ok"])
        self.assertIsNotNone(result["data"]["createColumn"]["obj"]["id"])
        self.assertEqual(result["data"]["createColumn"]["obj"]["query"], "TestQuery")
        self.assertEqual(result["data"]["createColumn"]["obj"]["outputType"], "str")
        self.assertEqual(result["data"]["createColumn"]["obj"]["agentic"], False)

    def test_start_extract_mutation(self):
        mutation = """
            mutation {{
                startExtract(
                    extractId: "{}",
                ) {{
                    ok
                    message
                }}
            }}
        """.format(
            to_global_id("ExtractType", self.extract.id)
        )

        with patch(
            "opencontractserver.tasks.extract_orchestrator_tasks.run_extract.s"
        ) as mock_task:
            result = self.client.execute(mutation)
            self.assertIsNone(result.get("errors"))
            self.assertTrue(result["data"]["startExtract"]["ok"])
            self.assertEqual("STARTED!", result["data"]["startExtract"]["message"])
            mock_task.assert_called_once()

    def test_add_documents_to_extract_mutation(self):
        mutation = """
            mutation {{
                addDocsToExtract(
                    extractId: "{}",
                    documentIds: ["{}", "{}"]
                ) {{
                    ok
                    message
                }}
            }}
        """.format(
            to_global_id("ExtractType", self.extract.id),
            to_global_id("DocumentType", self.document1.id),
            to_global_id("DocumentType", self.document2.id),
        )

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["addDocsToExtract"]["ok"])

        self.extract.refresh_from_db()
        self.assertIn(self.document1, self.extract.documents.all())
        self.assertIn(self.document2, self.extract.documents.all())

    def test_remove_documents_from_extract_mutation(self):
        self.extract.documents.add(self.document1, self.document2)

        mutation = """
            mutation {{
                removeDocsFromExtract(
                    extractId: "{}",
                    documentIdsToRemove: ["{}", "{}"]
                ) {{
                    ok
                    message
                }}
            }}
        """.format(
            to_global_id("ExtractType", self.extract.id),
            to_global_id("DocumentType", self.document1.id),
            to_global_id("DocumentType", self.document2.id),
        )

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["removeDocsFromExtract"]["ok"])

        self.extract.refresh_from_db()
        self.assertNotIn(self.document1, self.extract.documents.all())
        self.assertNotIn(self.document2, self.extract.documents.all())
