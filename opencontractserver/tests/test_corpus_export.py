import base64
import pathlib
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from pydantic import TypeAdapter, ValidationError

from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.tasks import import_corpus
from opencontractserver.tasks.utils import package_zip_into_base64
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.etl import build_document_export, build_label_lookups
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()

pytestmark = pytest.mark.django_db


class ExportCorpusTestCase(TestCase):
    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="12345678")

        export_zip_base64_file_string = package_zip_into_base64(
            self.fixtures_path / "Test_Corpus_EXPORT.zip"
        )
        self.original_corpus_obj = Corpus.objects.create(
            title="New Import", creator=self.user, backend_lock=False
        )
        set_permissions_for_obj_to_user(
            self.user, self.original_corpus_obj, [PermissionTypes.ALL]
        )

        base64_img_bytes = export_zip_base64_file_string.encode("utf-8")
        decoded_file_data = base64.decodebytes(base64_img_bytes)

        with transaction.atomic():
            temporary_file = TemporaryFileHandle.objects.create()
            temporary_file.file.save(
                f"corpus_import_{uuid.uuid4()}.pdf", ContentFile(decoded_file_data)
            )

        import_task = import_corpus.s(
            temporary_file.id, self.user.id, self.original_corpus_obj.id
        )

        import_task.apply().get()

        # TODO - load the import zip into memory so we can compare exports against original import
        self.import_zip = None

    # TODO - we really need to update the export format... to make it more useful for exchanges analyses,
    #  stopped exporting ALL labelset labels
    #  and not just export labels used in the corpus. This is a temporary fix to get working outputs,
    #  but more thorough redesign is needed..
    def test_export_utils(self):
        print(
            "# TEST CORPUS EXPORT PIPELINE #########################################################################"
        )
        self.original_corpus_obj.refresh_from_db()

        print("1)\tTest building label lookups")
        label_lookups = build_label_lookups(corpus_id=self.original_corpus_obj.id)
        print("\t\tSUCCESS")

        print("2)\tTest that we have proper text_labels value in return obj")
        assert "text_labels" in label_lookups
        print(f"\t\tlabel_lookups['text_labels']: {label_lookups['text_labels']}")
        print(f"Length of text_labels: {len(label_lookups['text_labels'])}")
        assert len(label_lookups["text_labels"]) == 3
        print("\t\tSUCCESS")

        print("3)\tTest that we have proper doc_labels value in return obj")
        assert "doc_labels" in label_lookups
        print(f"\t\tlabel_lookups['doc_labels']: {label_lookups['doc_labels']}")
        print(f"Length of doc_labels: {len(label_lookups['doc_labels'])}")
        assert len(label_lookups["doc_labels"]) == 1
        print("\t\tSUCCESS")

        print(
            "4)\tTest that we can burn in each document and produce labelled document"
        )
        for doc in self.original_corpus_obj.documents.all():

            build_document_export(
                label_lookups=label_lookups,
                doc_id=doc.id,
                corpus_id=self.original_corpus_obj.id,
            )

            # TODO - need to check that each doc returns data of this format and it's valid (check against import)

            # return (
            #     doc_name,
            #     base64_encoded_message,
            #     doc_annotation_json,
            #     text_labels,
            #     doc_labels,
            # )

            # TODO - how do we check for the highlights and make sure they're right? PyMuPdf maybe?

    def test_exported_values_match_types(self):
        """
        Test that the exported values from build_document_export match the expected data shapes.
        """
        print("5)\tTest that exported values match the expected data shapes")

        # Build label lookups
        label_lookups = build_label_lookups(corpus_id=self.original_corpus_obj.id)

        for doc in self.original_corpus_obj.documents.all():
            (
                doc_name,
                base64_encoded_message,
                doc_annotation_json,
                text_labels,
                doc_labels,
            ) = build_document_export(
                label_lookups=label_lookups,
                doc_id=doc.id,
                corpus_id=self.original_corpus_obj.id,
            )

            # Validate types using Pydantic TypeAdapter
            try:
                # Validate doc_annotation_json matches OpenContractDocExport
                adapter = TypeAdapter(OpenContractDocExport)
                adapter.validate_python(doc_annotation_json)
            except ValidationError as e:
                self.fail(
                    f"doc_annotation_json does not match OpenContractDocExport: {e}"
                )

            # Assert other types
            self.assertIsInstance(doc_name, str)
            self.assertIsInstance(base64_encoded_message, str)
            self.assertIsInstance(text_labels, dict)
            self.assertIsInstance(doc_labels, dict)

            # Additional checks on text_labels and doc_labels
            for label in text_labels.values():
                self.assertTrue(isinstance(label, dict))
                self.assertIn("id", label)
                self.assertIn("text", label)
                self.assertIn("color", label)

            for label in doc_labels.values():
                self.assertTrue(isinstance(label, dict))
                self.assertIn("id", label)
                self.assertIn("text", label)
                self.assertIn("color", label)

            print(f"\t\tDocument '{doc_name}' exported successfully and matches types")

        print("\t\tSUCCESS")
