from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus, CorpusQuery
from opencontractserver.documents.models import Document

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user

    def build_absolute_uri(self, location=None):
        return "http://www.IAmNotARealURL.com"


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

        # Add initial markdown description and a revision using update_description()
        initial_md = "# Heading\n\nInitial description"
        self.corpus.update_description(new_content=initial_md, author=self.user)

        # Create a second revision
        second_md = "# Heading\n\nUpdated description v2"
        self.corpus.update_description(new_content=second_md, author=self.user)

    def test_corpus_query(self):
        corpus_query = CorpusQuery.objects.create(
            query="What is the capital of France?",
            corpus=self.corpus,
            creator=self.user,
        )

        query = """
            query {{
                corpusQuery(id: "{}") {{
                    id
                    query
                    response
                }}
            }}
        """.format(
            to_global_id("CorpusQueryType", corpus_query.id)
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["corpusQuery"]["query"], "What is the capital of France?"
        )
        self.assertEqual(
            result["data"]["corpusQuery"]["id"],
            to_global_id("CorpusQueryType", corpus_query.id),
        )

    def test_corpus_queries(self):
        CorpusQuery.objects.create(
            query="What is the capital of France?",
            corpus=self.corpus,
            creator=self.user,
        )
        CorpusQuery.objects.create(
            query="What is the population of Germany?",
            corpus=self.corpus,
            creator=self.user,
        )

        query = """
            query {
                corpusQueries {
                    edges {
                        node {
                            id
                            query
                            response
                        }
                    }
                }
            }
        """

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        queries = result["data"]["corpusQueries"]["edges"]
        self.assertEqual(len(queries), 2)
        self.assertIn(
            "What is the capital of France?", [q["node"]["query"] for q in queries]
        )
        self.assertIn(
            "What is the population of Germany?", [q["node"]["query"] for q in queries]
        )

    def test_corpus_description_and_revisions(self):
        """Ensure mdDescription file link and descriptionRevisions list are returned."""

        query = """
            query($id: ID!) {
                corpus(id: $id) {
                    id
                    mdDescription
                    descriptionRevisions {
                        version
                        snapshot
                    }
                }
            }
        """

        variables = {"id": to_global_id("CorpusType", self.corpus.id)}

        result = self.client.execute(query, variables=variables)

        self.assertIsNone(result.get("errors"))

        corpus_data = result["data"]["corpus"]

        # mdDescription should be a non-empty string (URL).
        self.assertTrue(
            corpus_data["mdDescription"].startswith("http")
            or corpus_data["mdDescription"].startswith("/")
        )

        revisions = corpus_data["descriptionRevisions"]
        # Expect 2 revisions (initial + second)
        self.assertEqual(len(revisions), 2)

        versions = [rev["version"] for rev in revisions]
        self.assertListEqual(versions, [1, 2])
