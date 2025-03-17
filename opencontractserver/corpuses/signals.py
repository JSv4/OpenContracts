from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from opencontractserver.tasks.corpus_tasks import process_corpus_action

from .models import Corpus


@receiver(m2m_changed, sender=Corpus.documents.through)
def handle_document_added_to_corpus(sender, instance, action, pk_set, **kwargs):
    if action == "post_add":
        process_corpus_action.si(
            corpus_id=instance.id,
            document_ids=list(pk_set),
            user_id=instance.creator.id,
        ).apply_async()
