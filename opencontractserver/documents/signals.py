import logging

from celery import chain
from django.db import transaction
from django.utils import timezone

from opencontractserver.tasks.doc_tasks import (
    extract_pdf_thumbnail,
    nlm_ingest_pdf,
    set_doc_lock_state, extract_txt_thumbnail, ingest_txt,
)
from opencontractserver.tasks.embeddings_task import calculate_embedding_for_doc_text

logger = logging.getLogger(__name__)


def process_doc_on_create_atomic(sender, instance, created, **kwargs):
    # When a new document is created *AND* a pawls_parse_file is NOT present at creation,
    # run OCR and token extract. Sometimes a doc will be created with tokens preloaded,
    # such as when we do an import.
    if created and not instance.processing_started:

        # Processing pipeline will depend on filetype
        if instance.file_type == "application/pdf":

            # Using nlm-ingestor exclusively
            ingest_tasks = [
                extract_pdf_thumbnail.s(doc_id=instance.id),
                nlm_ingest_pdf.si(user_id=instance.creator.id, doc_id=instance.id),
                *(
                    [calculate_embedding_for_doc_text.si(doc_id=instance.id)]
                    if instance.embedding is None
                    else []
                ),
                set_doc_lock_state.si(locked=False, doc_id=instance.id),
            ]

        elif instance.file_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":

            # TODO - process docx
            ingest_tasks = []

        elif instance.file_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":

            # TODO - process pptx
            ingest_tasks = []

        elif instance.file_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":

            # TODO - process xlsx
            ingest_tasks = []

        elif instance.file_type == "application/txt":

            ingest_tasks = [
                extract_txt_thumbnail.s(doc_id=instance.id),
                ingest_txt.si(user_id=instance.creator.id, doc_id=instance.id),  # Currently a sentence parser
                *(
                    [calculate_embedding_for_doc_text.si(doc_id=instance.id)]
                    if instance.embedding is None
                    else []
                ),
                set_doc_lock_state.si(locked=False, doc_id=instance.id),
            ]

        else:
            logger.warning(f"No ingest pipeline configured for {instance.file_type}")

        # Send tasks to celery for async execution
        instance.processing_started = timezone.now()
        instance.save()

        transaction.on_commit(lambda: chain(*ingest_tasks).apply_async())
