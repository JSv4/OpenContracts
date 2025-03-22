import logging

from django.apps import apps
from django.conf import settings
from django.db import transaction

from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
    calculate_embedding_for_note_text,
)

logger = logging.getLogger(__name__)


def process_annot_on_create_atomic(sender, instance, created, **kwargs):
    """
    Signal handler to process an annotation after it is created.
    Queues tasks to calculate embeddings for the annotation.

    If the annotation is structural, also ensures it has embeddings for all corpuses
    its document belongs to.

    Args:
        sender: The model class.
        instance: The annotation being saved.
        created (bool): True if a new record was created.
        **kwargs: Additional keyword arguments.
    """
    # When a new annotation is created *AND* no embeddings are present at creation,
    # hit the embeddings microservice. Since embeddings can be an array, need to test for None
    if created and instance.embedding is None:
        logger.debug(
            f"Calculating default embeddings for newly created annotation {instance.id}"
        )
        calculate_embedding_for_annotation_text.si(
            annotation_id=instance.id
        ).apply_async()

        # If this is a structural annotation, also ensure it has embeddings for all corpuses
        # its document belongs to
        if instance.structural:
            logger.debug(
                f"Processing structural annotation {instance.id} for document {instance.document_id} "
                f"to ensure it has embeddings for all corpuses"
            )
            process_structural_annotation_for_corpuses(instance)


def process_note_on_create_atomic(sender, instance, created, **kwargs):
    """
    Signal handler to process a note after it is created.
    Queues tasks to calculate embeddings for the note.

    Args:
        sender: The model class.
        instance: The note being saved.
        created (bool): True if a new record was created.
        **kwargs: Additional keyword arguments.
    """
    if created and instance.embedding is None:
        logger.debug(f"Calculating embeddings for newly created note {instance.id}")
        calculate_embedding_for_note_text.si(note_id=instance.id).apply_async()


def process_structural_annotation_for_corpuses(annotation):
    """
    Checks if a structural annotation's document belongs to any corpuses,
    and ensures the annotation has embeddings for each corpus's preferred embedder.

    Args:
        annotation: The annotation to process
    """
    # Import models here to avoid circular imports
    Corpus = apps.get_model("corpuses", "Corpus")
    Annotation = apps.get_model("annotations", "Annotation")

    # Get all corpuses that contain this annotation's document with their preferred embedders
    # in a single efficient query
    corpus_embedders = Corpus.objects.filter(documents=annotation.document).values_list(
        "id", "preferred_embedder"
    )

    if not corpus_embedders:
        return

    for corpus_id, preferred_embedder in corpus_embedders:
        # Use the corpus embedder or fall back to default
        embedder_path = preferred_embedder or getattr(
            settings, "DEFAULT_EMBEDDER", None
        )
        if not embedder_path:
            continue

        # Check if annotation already has an embedding with this embedder
        if not Annotation.objects.filter(
            id=annotation.id, embedding_set__embedder_path=embedder_path
        ).exists():
            # Queue task to create embedding for this corpus's embedder
            transaction.on_commit(
                lambda annot_id=annotation.id, emb_path=embedder_path: calculate_embedding_for_annotation_text.delay(
                    annotation_id=annot_id, embedder_path=emb_path
                )
            )
            # Log that we're creating an embedding for an annotation after-the-fact
            logger.info(
                f"Queued embedding calculation for structural annotation {annotation.id} "
                f"using embedder {embedder_path} from corpus {corpus_id}"
            )
