import logging
from celery import chain
from django.db import transaction
from django.utils import timezone

from opencontractserver.tasks.doc_tasks import (
    ingest_doc,
    set_doc_lock_state,
    extract_thumbnail,
)
from opencontractserver.tasks.embeddings_task import calculate_embedding_for_doc_text


logger = logging.getLogger(__name__)


def process_doc_on_create_atomic(sender, instance, created, **kwargs):
    """
    Signal handler to process a document after it is created.
    Initiates a chain of tasks to extract a thumbnail, ingest the document,
    calculate embeddings, and unlock the document.

    Args:
        sender: The model class.
        instance: The instance being saved.
        created (bool): True if a new record was created.
        **kwargs: Additional keyword arguments.
    """
    if created and not instance.processing_started:

        ingest_tasks = []

        # Add the thumbnail extraction task
        ingest_tasks.append(extract_thumbnail.si(doc_id=instance.id))

        # Add the ingestion task
        ingest_tasks.append(
            ingest_doc.si(
                user_id=instance.creator.id,
                doc_id=instance.id,
            )
        )

        # Optionally add the embedding calculation task
        if instance.embedding is None:
            ingest_tasks.append(calculate_embedding_for_doc_text.si(doc_id=instance.id))

        # Add the task to unlock the document
        ingest_tasks.append(set_doc_lock_state.si(locked=False, doc_id=instance.id))

        # Update the processing_started timestamp
        instance.processing_started = timezone.now()
        instance.save()

        # Send tasks to Celery for asynchronous execution
        transaction.on_commit(lambda: chain(*ingest_tasks).apply_async())
