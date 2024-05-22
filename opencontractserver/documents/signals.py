from celery import chain
from django.conf import settings
from django.db import transaction

from opencontractserver.tasks.doc_tasks import (
    extract_thumbnail,
    nlm_ingest_pdf,
    set_doc_lock_state,
    split_pdf_for_processing,
)
from opencontractserver.tasks.embeddings_task import calculate_embedding_for_doc_text


def process_doc_on_create_atomic(sender, instance, created, **kwargs):

    # When a new document is created *AND* a pawls_parse_file is NOT present at creation,
    # run OCR and token extract. Sometimes a doc will be created with tokens preloaded,
    # such as when we do an import.
    if created and not instance.pawls_parse_file:

        # USE NLM Ingestor if NLM_INGESTOR_ACTIVE is set to True
        if settings.NLM_INGESTOR_ACTIVE:
            ingest_tasks = [
                extract_thumbnail.s(doc_id=instance.id),
                nlm_ingest_pdf.si(user_id=instance.creator.id, doc_id=instance.id),
                *(
                    [calculate_embedding_for_doc_text.si(doc_id=instance.id)]
                    if instance.embedding is None
                    else []
                ),
                set_doc_lock_state.si(locked=False, doc_id=instance.id),
            ]
        # Otherwise fall back to PAWLs parser
        else:
            ingest_tasks = [
                extract_thumbnail.s(doc_id=instance.id),
                split_pdf_for_processing.si(
                    user_id=instance.creator.id, doc_id=instance.id
                ),
                *(
                    [calculate_embedding_for_doc_text.si(doc_id=instance.id)]
                    if instance.embedding is None
                    else []
                ),
                set_doc_lock_state.si(locked=False, doc_id=instance.id),
            ]

        # Send tasks to celery for async execution
        transaction.on_commit(lambda: chain(*ingest_tasks).apply_async())
