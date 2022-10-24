import pathlib

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase
from graphene.test import Client

from config.graphql.schema import schema
from config.graphql.serializers import CorpusSerializer
from opencontractserver.tasks.utils import package_zip_into_base64

User = get_user_model()


def _import_corpus_zip(user: User):

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"
    client = Client(schema, context_value=TestContext(user))
    export_zip_base64_file_string = package_zip_into_base64(
        fixtures_path / "Test_Corpus_EXPORT.zip"
    )

    executed = client.execute(
        """
        mutation($base64FileString: String!) {
            importOpenContractsZip(base64FileString: $base64FileString) {
              ok
              message
              corpus {
                id
                icon
                description
                title
                backendLock
              }
            }
          }
        """,
        variable_values={"base64FileString": export_zip_base64_file_string},
    )
    return executed


class TestContext:
    def __init__(self, user):
        self.user = user


class GraphQLTestCase(TestCase):

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):

        with transaction.atomic():
            self.user = User.objects.create_user(
                username="bob",
                password="12345678",
                is_usage_capped=False,  # Otherwise no importing...
            )

    def test_zip_upload(self):

        """
        Test that we can import an OpenContracts export via GraphQL and get back the expected
        responses from the endpoint.
        """
        executed = _import_corpus_zip(self.user)

        serializer = CorpusSerializer(
            data=executed["data"]["importOpenContractsZip"]["corpus"]
        )
        assert serializer.is_valid(raise_exception=True)
        assert executed["data"]["importOpenContractsZip"]["ok"] is True
        assert executed["data"]["importOpenContractsZip"]["message"] == "Started"

        # NOTE - in our current test environment, celery worker is not booted... so this never runs
