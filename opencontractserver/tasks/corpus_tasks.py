import logging
import uuid

from celery import chord, group, shared_task
from django.db import transaction
from django.utils import timezone

from opencontractserver.analyzer.models import Analysis
from opencontractserver.corpuses.models import CorpusAction
from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.tasks.analyzer_tasks import start_analysis
from opencontractserver.tasks.extract_orchestrator_tasks import (
    get_task_by_name,
    mark_extract_complete,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


@shared_task
def process_corpus_action(
    corpus_id: str | int, document_ids: list[str | int], user_id: str | int
):

    logger.info("process_corpus_action()...")

    actions = CorpusAction.objects.filter(corpus_id=corpus_id)
    action_tasks = []

    for action in actions:

        if action.fieldset:

            tasks = []

            extract = Extract(
                corpus=action.corpus,
                name=f"Corpus Action {action.name} Extract {uuid.uuid4()}",
                fieldset=action.fieldset,
                started=timezone.now(),
                creator_id=user_id,
            )
            extract.save()

            fieldset = action.fieldset

            for document_id in document_ids:

                row_results = DocumentAnalysisRow(
                    document_id=document_id,
                    extract_id=extract.id,
                    creator=extract.creator,
                )
                row_results.save()

                for column in fieldset.columns.all():
                    with transaction.atomic():
                        cell = Datacell.objects.create(
                            extract=extract,
                            column=column,
                            data_definition=column.output_type,
                            creator_id=user_id,
                            document_id=document_id,
                        )
                        set_permissions_for_obj_to_user(
                            user_id, cell, [PermissionTypes.CRUD]
                        )

                        # Add data cell to tracking
                        row_results.data.add(cell)

                        # Get the task function dynamically based on the column's task_name
                        task_func = get_task_by_name(column.task_name)
                        if task_func is None:
                            logger.error(
                                f"Task {column.task_name} not found for column {column.id}"
                            )
                            continue

                        # Add the task to the group
                        tasks.append(task_func.si(cell.pk))

            chord(group(*tasks))(mark_extract_complete.si(extract.id))

        elif action.analyzer:

            obj = Analysis.objects.create(
                analyzer=action.analyzer,
                analyzed_corpus_id=corpus_id,
                creator_id=user_id,
            )

            if action.analyzer.task_name:

                task_name = action.analyzer.task_name
                task_func = get_task_by_name(task_name)

                if task_func is None:
                    logger.error(
                        f"Queue {task_name} for corpus {corpus_id} failed as task could not be found..."
                    )
                    continue

                # Add the task to the group
                action_tasks.extend(
                    [
                        task_func.si(doc_id=doc_id, analysis_id=obj.id)
                        for doc_id in document_ids
                    ]
                )
            else:

                logger.info(f" - retrieved analysis: {obj}")

                action_tasks.append(
                    start_analysis.s(analysis_id=obj.id, doc_ids=document_ids)
                )

                # Once we've run through all the actions, start tasks for processing.
                group(action_tasks).apply_async()

        else:
            raise ValueError(
                "Unexpected action configuration... no analyzer or fieldset."
            )
