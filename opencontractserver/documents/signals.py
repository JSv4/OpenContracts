import logging

from celery import chain
from django.apps import apps
from django.db import transaction
from django.db.models.signals import m2m_changed
from django.utils import timezone

from opencontractserver.tasks.doc_tasks import (
    extract_thumbnail,
    ingest_doc,
    set_doc_lock_state,
)
from opencontractserver.tasks.embeddings_task import calculate_embedding_for_doc_text

logger = logging.getLogger(__name__)


# Kicks off document processing pipeline - including thumbnail extraction, ingestion,
# and unlocking the document
def process_doc_on_create_atomic(sender, instance, created, **kwargs):
    """
    Signal handler to process a document after it is created.
    Initiates a chain of tasks to extract a thumbnail, ingest the document,
    and unlock the document.

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

        # Removed embedding calculation from document creation
        # Embeddings will now be calculated only when document is linked to a corpus

        # Add the task to unlock the document
        ingest_tasks.append(set_doc_lock_state.si(locked=False, doc_id=instance.id))

        # Update the processing_started timestamp
        instance.processing_started = timezone.now()
        instance.save()

        # Send tasks to Celery for asynchronous execution
        transaction.on_commit(lambda: chain(*ingest_tasks).apply_async())


def process_doc_on_corpus_add(sender, instance, action, pk_set, **kwargs):
    """
    Signal handler to process a document when it's added to a corpus.
    Initiates a task to calculate embeddings for the document if needed.

    Args:
        sender: The through model class for the m2m relationship.
        instance: The instance of the model that sent the signal (Corpus).
        action (str): The type of m2m action ('post_add', 'post_remove', etc.).
        pk_set (set): A set of primary key values that were added/removed.
        **kwargs: Additional keyword arguments.
    """
    # Only proceed when documents are being added to a corpus
    if action != "post_add" or not pk_set:
        return

    from opencontractserver.documents.models import Document

    # Get the documents that were just added to the corpus
    documents = Document.objects.filter(pk__in=pk_set)

    # For each document that doesn't have embeddings yet, queue a task to calculate them
    for doc in documents:
        transaction.on_commit(
            lambda doc_id=doc.id: calculate_embedding_for_doc_text.delay(
                doc_id=doc_id, corpus_id=instance.id
            )
        )
        logger.info(
            f"Queued embedding calculation for document {doc.id} after adding to corpus {instance.id}"
        )


# Connect the signal handler to the m2m_changed signal for Corpus.documents
def connect_corpus_document_signals():
    """
    Connect the m2m_changed signal for Corpus.documents to our signal handler.
    Called during Django app initialization.
    """
    Corpus = apps.get_model("corpuses", "Corpus")
    m2m_changed.connect(
        process_doc_on_corpus_add,
        sender=Corpus.documents.through,
        dispatch_uid="process_doc_on_corpus_add",
    )
