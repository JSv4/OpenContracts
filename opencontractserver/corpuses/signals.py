from django.db import transaction

from opencontractserver.tasks.query_tasks import run_query


def run_query_on_create(sender, instance, created, **kwargs):

    print(f"run_query_on_create - instance: {instance}")
    # Kick off the async processing of query
    if created:
        print("Created... kick off")
        # Send tasks to celery for async execution
        transaction.on_commit(lambda: run_query.si(query_id=instance.id).apply_async())
