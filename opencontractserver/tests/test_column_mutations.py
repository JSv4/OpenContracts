import logging

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.extracts.models import Column, Fieldset, LanguageModel
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
logger = logging.getLogger(__name__)


class TestContext:
    def __init__(self, user):
        self.user = user


class ColumnMutationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpassword")
        self.client = Client(schema, context_value=TestContext(self.user))

        self.language_model = LanguageModel.objects.create(model="TestModel", creator=self.user)
        self.fieldset = Fieldset.objects.create(
            owner=self.user, name="TestFieldset", description="Test description", creator=self.user
        )
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            query="OriginalQuery",
            match_text="OriginalMatchText",
            output_type="str",
            limit_to_label="OriginalLimit",
            instructions="OriginalInstructions",
            language_model=self.language_model,
            agentic=False,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, self.column, [PermissionTypes.CRUD]
        )

    def test_update_column_mutation(self):
        mutation = """
            mutation {{
                updateColumn(
                    id: "{}",
                    query: "UpdatedQuery",
                    matchText: "UpdatedMatchText",
                    outputType: "int",
                    limitToLabel: "UpdatedLimit",
                    instructions: "UpdatedInstructions",
                    languageModelId: "{}",
                    agentic: true
                ) {{
                    ok
                    objId
                    message
                }}
            }}
        """.format(
            to_global_id("ColumnType", self.column.id),
            to_global_id("LanguageModelType", self.language_model.id),
        )
        logger.info(f"Test mutation: {mutation}")

        result = self.client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        print(result.get('data'))
        self.assertTrue(result["data"]["updateColumn"]["ok"])

        updated_column = Column.objects.get(id=self.column.id)
        self.assertEqual(updated_column.query, "UpdatedQuery")
        self.assertEqual(updated_column.match_text, "UpdatedMatchText")
        self.assertEqual(updated_column.output_type, "int")
        self.assertEqual(updated_column.limit_to_label, "UpdatedLimit")
        self.assertEqual(updated_column.instructions, "UpdatedInstructions")
        self.assertTrue(updated_column.agentic)
