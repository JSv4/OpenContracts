from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import from_global_id, to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus, CorpusQuery
from opencontractserver.documents.models import Document

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class CorpusQueryMutationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

        self.corpus = Corpus.objects.create(title="TestCorpus", creator=self.user)
        self.document = Document.objects.create(
            title="TestDocument",
            description="Test Description",
            pdf_file="path/to/file.pdf",
            creator=self.user,
        )

    def test_start_query_for_corpus_mutation(self):
        mutation = """
            mutation {{
                askQuery(
                    corpusId: "{}",
                    query: "What is the capital of France?"
                ) {{
                    ok
                    message
                    obj {{
                        id
                        query
                        response
                    }}
                }}
            }}
        """.format(
            to_global_id("CorpusType", self.corpus.id)
        )

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["askQuery"]["ok"])

        created_query_id = result["data"]["askQuery"]["obj"]["id"]
        created_query = CorpusQuery.objects.get(id=from_global_id(created_query_id)[1])

        self.assertEqual(created_query.query, "What is the capital of France?")
        self.assertEqual(created_query.corpus, self.corpus)
        self.assertEqual(created_query.creator, self.user)
