import logging

from celery import shared_task
from django.db import transaction

from opencontractserver.corpuses.models import Corpus, CorpusAction
from opencontractserver.extracts.models import Datacell
from opencontractserver.tasks.extract_orchestrator_tasks import get_task_by_name
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


@shared_task
def process_corpus_actions(corpus_id: int, document_id: int, trigger: str):

    tasks = []

    corpus = Corpus.objects.get(id=corpus_id)
    actions = CorpusAction.objects.filter(corpus=corpus, trigger=trigger)

    for action in actions:
        if action.analyzer:
            if action.analyzer.task_name:

                # Get the task function dynamically based on the column's task_name
                task_name = action.analyzer.task_name
                task_func = get_task_by_name(task_name)
                if task_func is None:
                    logger.error(
                        f"Queue {task_name} for doc {document_id} added to corpus {corpus_id}"
                    )
                    continue

                # Add the task to the group
                tasks.append(task_func.si(doc_id=document_id, corpus_id=corpus_id))
                # TODO - add collector

        elif action.fieldset:
            for column in action.fieldset.columns.all():
                with transaction.atomic():
                    cell = Datacell.objects.create(
                        column=column,
                        data_definition=column.output_type,
                        creator_id=corpus.creator,
                        document_id=document_id,
                    )
                    set_permissions_for_obj_to_user(corpus.creator_id, cell, [PermissionTypes.CRUD])

                    # Get the task function dynamically based on the column's task_name
                    task_func = get_task_by_name(column.task_name)
                    if task_func is None:
                        logger.error(
                            f"Task {column.task_name} not found for column {column.id}"
                        )
                        continue

                    # Add the task to the group
                    tasks.append(task_func.si(cell.pk))

    # Run tasks as group
    group(tasks).apply_async()
