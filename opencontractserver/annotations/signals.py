from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
    calculate_embedding_for_note_text,
)


def process_annot_on_create_atomic(sender, instance, created, **kwargs):

    # When a new annotation is created *AND* no embeddings are present at creation,
    # hit the embeddings microservice. Since embeddings can be an array, need to test for None
    if created and instance.embedding is None:
        calculate_embedding_for_annotation_text.si(
            annotation_id=instance.id
        ).apply_async()


def process_note_on_create_atomic(sender, instance, created, **kwargs):
    if created and instance.embedding is None:
        calculate_embedding_for_note_text.si(note_id=instance.id).apply_async()
