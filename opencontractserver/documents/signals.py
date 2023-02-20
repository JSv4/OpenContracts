from celery import chain
from django.db import transaction

from opencontractserver.tasks import (
    base_64_encode_document,
    parse_base64_pdf,
    write_pawls_file,
)
from opencontractserver.tasks.doc_tasks import extract_thumbnail, split_pdf_for_processing


def process_doc_on_create_atomic(sender, instance, created, **kwargs):

    # When a new document is created *AND* a pawls_parse_file is NOT present at creation,
    # run OCR and token extract. Sometimes a doc will be created with tokens preloaded,
    # such as when we do an import.
    if created and not instance.pawls_parse_file:
        transaction.on_commit(
            lambda: chain(
                *[
                    base_64_encode_document.s(doc_id=instance.id),
                    split_pdf_for_processing.s(user_id=instance.creator.id, doc_id=instance.id),
                    parse_base64_pdf.s(doc_id=instance.id),
                    write_pawls_file.s(doc_id=instance.id),
                    extract_thumbnail.s(doc_id=instance.id),
                ]
            ).apply_async()
        )
