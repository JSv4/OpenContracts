import logging
import uuid

from celery import chord, group, shared_task
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from opencontractserver.corpuses.models import CorpusAction
from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.tasks.analyzer_tasks import (
    mark_analysis_complete,
    start_analysis,
)
from opencontractserver.tasks.extract_orchestrator_tasks import mark_extract_complete
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.analysis import create_and_setup_analysis
from opencontractserver.utils.celery_tasks import (
    get_doc_analyzer_task_by_name,
    get_task_by_name,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


@shared_task
def process_corpus_action(
    corpus_id: str | int, document_ids: list[str | int], user_id: str | int
):

    logger.info("process_corpus_action()...")

    actions = CorpusAction.objects.filter(
        Q(corpus_id=corpus_id, disabled=False)
        | Q(run_on_all_corpuses=True, disabled=False)
    )

    for action in actions:

        action_tasks = []

        if action.fieldset:

            tasks = []

            with transaction.atomic():
                extract = Extract(
                    corpus=action.corpus,
                    name=f"Corpus Action {action.name} Extract {uuid.uuid4()}",
                    fieldset=action.fieldset,
                    started=timezone.now(),
                    creator_id=user_id,
                    corpus_action=action,
                )
                extract.save()

            fieldset = action.fieldset

            for document_id in document_ids:

                with transaction.atomic():
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

            transaction.on_commit(
                lambda: chord(group(*tasks))(mark_extract_complete.si(extract.id))
            )

        elif action.analyzer:
            analysis = create_and_setup_analysis(
                action.analyzer, corpus_id, user_id, document_ids, corpus_action=action
            )

            if action.analyzer.task_name:

                task_name = action.analyzer.task_name
                task_func = get_doc_analyzer_task_by_name(task_name)

                if task_func is None:
                    logger.error(
                        f"Queue {task_name} for corpus {corpus_id} failed as task could not be found..."
                    )
                    continue

                logger.info(f"Added task {task_name} to queue: {task_func}")
                action_tasks.extend(
                    [
                        task_func.s(doc_id=doc_id, analysis_id=analysis.id)
                        for doc_id in document_ids
                    ]
                )

                transaction.on_commit(
                    lambda: chord(group(*action_tasks))(
                        mark_analysis_complete.si(
                            analysis_id=analysis.id, doc_ids=document_ids
                        )
                    )
                )

            else:
                logger.info(f" - retrieved analysis: {analysis}")

                action_tasks.append(
                    start_analysis.s(analysis_id=analysis.id, doc_ids=document_ids)
                )

                transaction.on_commit(lambda: group(*action_tasks).apply_async())

        else:
            raise ValueError(
                "Unexpected action configuration... no analyzer or fieldset."
            )

    return True
