from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import (
    Column,
    Extract,
    Fieldset,
    LanguageModel,
    Datacell,
)
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsQueryTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

        self.language_model = LanguageModel.objects.create(
            model="TestModel", creator=self.user
        )
        self.fieldset = Fieldset.objects.create(
            owner=self.user,
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )
        self.column = Column.objects.create(
            creator=self.user,
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
            creator=self.user,
        )
        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Doc",
            description="USC Title 1 - Chapter 1",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )
        self.row = Datacell.objects.create(
            extract=self.extract,
            column=self.column,
            data={"data": "TestData"},
            data_definition="str",
            creator=self.user,
            document=self.doc,
        )

    def test_language_model_query(self):
        query = """
            query {
                languageModel(id: "%s") {
                    id
                    model
                }
            }
        """ % to_global_id(
            "LanguageModelType", self.language_model.id
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["languageModel"]["id"],
            to_global_id("LanguageModelType", self.language_model.id),
        )
        self.assertEqual(result["data"]["languageModel"]["model"], "TestModel")

    def test_fieldset_query(self):
        query = """
            query {
                fieldset(id: "%s") {
                    id
                    name
                    description
                }
            }
        """ % to_global_id(
            "FieldsetType", self.fieldset.id
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["fieldset"]["id"],
            to_global_id("FieldsetType", self.fieldset.id),
        )
        self.assertEqual(result["data"]["fieldset"]["name"], "TestFieldset")
        self.assertEqual(result["data"]["fieldset"]["description"], "Test description")

    def test_column_query(self):
        query = """
            query {
                column(id: "%s") {
                    id
                    query
                    outputType
                    agentic
                }
            }
        """ % to_global_id(
            "ColumnType", self.column.id
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["column"]["id"], to_global_id("ColumnType", self.column.id)
        )
        self.assertEqual(result["data"]["column"]["query"], "TestQuery")
        self.assertEqual(result["data"]["column"]["outputType"], "str")
        self.assertEqual(result["data"]["column"]["agentic"], False)

    def test_extract_query(self):
        query = """
            query {
                extract(id: "%s") {
                    id
                    name
                }
            }
        """ % to_global_id(
            "ExtractType", self.extract.id
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["extract"]["id"],
            to_global_id("ExtractType", self.extract.id),
        )
        self.assertEqual(result["data"]["extract"]["name"], "TestExtract")

    def test_datacell_query(self):
        query = """
            query {
                datacell(id: "%s") {
                    id
                    data
                    dataDefinition
                }
            }
        """ % to_global_id(
            "DatacellType", self.row.id
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["datacell"]["id"], to_global_id("DatacellType", self.row.id)
        )
        self.assertEqual(result["data"]["datacell"]["data"], {"data": "TestData"})
        self.assertEqual(result["data"]["datacell"]["dataDefinition"], "str")
