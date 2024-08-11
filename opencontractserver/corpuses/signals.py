from django.db import transaction

from opencontractserver.tasks.query_tasks import run_query

from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from .models import Corpus
from opencontractserver.tasks.corpus_tasks import process_corpus_action


@receiver(m2m_changed, sender=Corpus.documents.through)
def handle_document_added_to_corpus(sender, instance, action, pk_set, **kwargs):
    if action == "post_add":
        process_corpus_action.si(
            corpus_id=instance.id,
            document_ids=list(pk_set),
            user_id=instance.creator.id,
        ).apply_async()


def run_query_on_create(sender, instance, created, **kwargs):
    print(f"run_query_on_create - instance: {instance}")
    # Kick off the async processing of query
    if created:
        print("Created... kick off")
        # Send tasks to celery for async execution
        transaction.on_commit(lambda: run_query.si(query_id=instance.id).apply_async())
