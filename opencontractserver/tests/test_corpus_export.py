import base64
import pathlib
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction

from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.tasks import import_corpus
from opencontractserver.tasks.utils import package_zip_into_base64
from opencontractserver.utils.data_types import PermissionTypes
from opencontractserver.utils.etl_utils import (
    build_document_export,
    build_label_lookups,
)
from opencontractserver.utils.permissioning_utils import set_permissions_for_obj_to_user

User = get_user_model()

pytestmark = pytest.mark.django_db


class ExportCorpusTestCase:
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
        assert len(label_lookups["text_labels"]) == 2
        print("\t\tSUCCESS")

        print("3)\tTest that we have proper doc_labels value in return obj")
        assert "doc_labels" in label_lookups
        assert len(label_lookups["doc_labels"]) == 2
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
