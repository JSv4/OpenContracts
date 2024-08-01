import logging

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import transaction

from opencontractserver.documents.models import Document, DocumentAnalysisRow
from opencontractserver.annotations.models import Annotation
from opencontractserver.extracts.models import Datacell, Column, Fieldset, Extract
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user, user_has_permission_for_obj, \
    get_users_permissions_for_obj

User = get_user_model()


class DocumentAnalysisRowTestCase(TestCase):
    def setUp(self):
        with transaction.atomic():
            self.user = User.objects.create_user(username="testuser", password="testpassword")

            self.document = Document(
                title="Test Document",
                description="Test Description",
                creator=self.user
            )
            self.document.save()

            self.annotation = Annotation(
                document=self.document,
                creator=self.user,
                raw_text="Test annotation"
            )
            self.annotation.save()

            # Create a Fieldset and Column for the Datacell
            self.fieldset = Fieldset(
                name="Test Fieldset",
                description="Test Fieldset Description",
                creator=self.user
            )
            self.fieldset.save()

            self.column = Column(
                fieldset=self.fieldset,
                name="Test Column",
                query="Test Query",
                output_type="str",
                creator=self.user
            )
            self.column.save()

            self.extract = Extract(
                name="Test Extract",
                fieldset=self.fieldset,
                creator=self.user
            )
            self.extract.save()

            self.datacell = Datacell(
                document=self.document,
                creator=self.user,
                extract=self.extract,
                data_definition="Test data",
                column=self.column  # Associate the Datacell with the Column
            )
            self.datacell.save()

            self.row = DocumentAnalysisRow(
                document=self.document,
                creator=self.user
            )
            self.row.save()

    def test_document_analysis_row_creation(self):
        self.assertIsNotNone(self.row)
        self.assertEqual(self.row.document, self.document)
        self.assertEqual(self.row.creator, self.user)

    def test_document_analysis_row_relationships(self):
        self.row.annotations.add(self.annotation)
        self.row.data.add(self.datacell)

        self.assertEqual(self.row.annotations.count(), 1)
        self.assertEqual(self.row.data.count(), 1)
        self.assertIn(self.annotation, self.row.annotations.all())
        self.assertIn(self.datacell, self.row.data.all())

    def test_document_analysis_row_permissions(self):
        set_permissions_for_obj_to_user(self.user, self.row, [PermissionTypes.READ, PermissionTypes.UPDATE])

        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.READ))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.UPDATE))
        self.assertFalse(user_has_permission_for_obj(self.user, self.row, PermissionTypes.DELETE))

    def test_document_analysis_row_crud_permissions(self):

        logging.info("XOXOX - START")
        logging.info(get_users_permissions_for_obj(self.user, self.row,  include_group_permissions=True))

        logging.info(f"XOXOX - SETTING PERMISSIONS...")
        set_permissions_for_obj_to_user(
            self.user,
            self.row,
            [
                PermissionTypes.CREATE,
                PermissionTypes.READ,
                PermissionTypes.UPDATE,
                PermissionTypes.DELETE
            ]
        )
        logging.info(f"XOXOX - SET PERMISSIONS COMPLETE: ")
        logging.info(f"XOXOX - Permissions: {get_users_permissions_for_obj(self.user, self.row,  include_group_permissions=True)}")

        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.CREATE, include_group_permissions=True))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.READ))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.UPDATE))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.DELETE))

    def test_document_analysis_row_all_permissions(self):
        set_permissions_for_obj_to_user(self.user, self.row, [PermissionTypes.ALL])

        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.CREATE))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.READ))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.UPDATE))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.DELETE))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.PUBLISH))
        self.assertTrue(user_has_permission_for_obj(self.user, self.row, PermissionTypes.PERMISSION))
