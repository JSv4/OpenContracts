import json

from django.contrib.auth import get_user_model
from django.db import transaction
from graphene_django.utils.testing import GraphQLTestCase
from rest_framework.authtoken.models import Token

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ApiTokenAuthTestCase(GraphQLTestCase):
    GRAPHQL_URL = "http://localhost:8000/graphql/"
    REQUEST_CORPUSES_MUTATION = """
        {
          corpuses {
            edges {
              node {
                id
                title
                description
              }
            }
          }
        }
    """

    def setUp(self):

        # Create test user
        with transaction.atomic():
            self.user = User.objects.create_superuser(
                username="bob",
                password="12345678",
                is_usage_capped=False,  # Otherwise no importing...
            )

        # Create test API Token
        with transaction.atomic():
            self.token = Token.objects.create(user=self.user)

        print(f"Token: {self.token}")

    def test_token_create_corpus(self):

        """
        Test that we can import an OpenContracts export via GraphQL and get back the expected
        responses from the endpoint.
        """
        response = self.query(
            """
            mutation(
              $description: String!,
              $title: String!
            ) {
              createCorpus(
                description: $description,
                title: $title
              ) {
                ok
                message
              }
            }
            """,
            variables={
                "title": "Private Corpus",
                "description": "Randos shouldn't be peeping.",
            },
            headers={"HTTP_AUTHORIZATION": f"Key {self.token}"},
        )
        print(f"Response: {response}")
        print(f"Response content: {response.content}")
        response_json = json.loads(response.content)
        assert response_json["data"]["createCorpus"]["ok"] is True
        assert response_json["data"]["createCorpus"]["message"] == "Success"

        # Now, check without auth token for corpus... should be NONE
        response = self.query(self.REQUEST_CORPUSES_MUTATION)
        print(f"Response: {response}")
        print(f"Response content: {response.content}")
        response_json = json.loads(response.content)
        retrieved_corpuses = response_json["data"]["corpuses"]["edges"]
        self.assertTrue(len(retrieved_corpuses) == 0)

        # Now, check WITH auth token for corpus... should retrieve our corpus
        response = self.query(
            self.REQUEST_CORPUSES_MUTATION,
            headers={"HTTP_AUTHORIZATION": f"Key {self.token}"},
        )
        response_json = json.loads(response.content)
        retrieved_corpuses = response_json["data"]["corpuses"]["edges"]
        self.assertTrue(len(retrieved_corpuses) == 1)
        self.assertEqual(retrieved_corpuses[0]["node"]["title"], "Private Corpus")
