import logging

from celery import chain
from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.db.models.signals import m2m_changed
from django.utils import timezone

from opencontractserver.tasks.doc_tasks import (
    extract_thumbnail,
    ingest_doc,
    set_doc_lock_state,
)
from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
    calculate_embedding_for_doc_text,
)

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
    Initiates tasks to:
    1. Calculate embeddings for the document if needed.
    2. Calculate embeddings for all structural annotations of the document using
       the corpus's preferred embedder.

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

    from opencontractserver.annotations.models import Annotation

    # Get the preferred embedder for the corpus
    embedder_path = instance.preferred_embedder or getattr(
        settings, "DEFAULT_EMBEDDER", None
    )
    if not embedder_path:
        logger.warning(
            f"No embedder path available for corpus {instance.id}, skipping embeddings"
        )
        return

    # Queue document embedding tasks in bulk
    for doc_id in pk_set:
        transaction.on_commit(
            lambda doc_id=doc_id: calculate_embedding_for_doc_text.delay(
                doc_id=doc_id, corpus_id=instance.id
            )
        )
        logger.info(
            f"Queued embedding calculation for document {doc_id} after adding to corpus {instance.id}"
        )

    # Use the corpus creator for visibility filtering
    # This ensures we only process annotations visible to the corpus owner
    corpus_creator = instance.creator

    # Subquery to find annotations that already have embeddings with this embedder_path
    has_embedding_subquery = Exists(
        Annotation.objects.filter(
            id=OuterRef("id"), embedding_set__embedder_path=embedder_path
        )
    )

    # Get all structural annotations for all documents in one query
    # Filter to only those visible to the corpus creator
    # Filter to only those that don't already have embeddings with this embedder_path
    annotations_to_embed = (
        Annotation.objects.filter(document_id__in=pk_set, structural=True)
        .visible_to_user(corpus_creator)
        .annotate(has_embedding=has_embedding_subquery)
        .filter(has_embedding=False)
        .values_list("id", flat=True)
    )

    # Queue tasks for all identified annotations in a single loop
    for annot_id in annotations_to_embed:
        transaction.on_commit(
            lambda annot_id=annot_id: calculate_embedding_for_annotation_text.delay(
                annotation_id=annot_id, embedder_path=embedder_path
            )
        )
        logger.info(
            f"Queued embedding calculation for structural annotation {annot_id} using embedder {embedder_path}"
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
