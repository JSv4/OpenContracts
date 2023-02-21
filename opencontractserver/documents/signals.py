from celery import chain
from django.db import transaction

from opencontractserver.tasks.doc_tasks import extract_thumbnail, split_pdf_for_processing, set_doc_lock_state


def process_doc_on_create_atomic(sender, instance, created, **kwargs):

    # When a new document is created *AND* a pawls_parse_file is NOT present at creation,
    # run OCR and token extract. Sometimes a doc will be created with tokens preloaded,
    # such as when we do an import.
    if created and not instance.pawls_parse_file:
        transaction.on_commit(
            lambda: chain(
                *[
                    extract_thumbnail.s(
                        doc_id=instance.id
                    ),
                    split_pdf_for_processing.si(
                        user_id=instance.creator.id,
                        doc_id=instance.id
                    ),
                    set_doc_lock_state.si(
                        locked=False,
                        doc_id=instance.id
                    )
                ]
            ).apply_async()
        )
