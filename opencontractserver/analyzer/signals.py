from celery import chain
from django.db import transaction

from opencontractserver.tasks.analyzer_tasks import (
    install_analyzer_task,
    request_gremlin_manifest,
)


def install_gremlin_on_creation(sender, instance, created, **kwargs):

    # When we create a Gremlin object in DB, need to run async task to set it up
    if created:
        transaction.on_commit(
            lambda: chain(
                *[
                    request_gremlin_manifest.si(gremlin_id=instance.id),
                    install_analyzer_task.s(
                        gremlin_id=instance.id,
                    ),
                ]
            ).apply_async()
        )
