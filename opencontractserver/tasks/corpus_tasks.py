import logging

from celery import chord, group, shared_task
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from opencontractserver.analyzer.models import Analysis, Analyzer
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
def run_task_name_analyzer(
    analysis_id: int | str,
    document_ids: list[str | int] | None = None,
):

    analysis = Analysis.objects.get(pk=analysis_id)
    analyzer = analysis.analyzer

    task_name = analyzer.task_name
    task_func = get_doc_analyzer_task_by_name(task_name)

    if task_func is None:
        msg = f"Task {task_name} for analysis {analysis_id} failed as task could not be found..."
        logger.error(msg)
        raise ValueError(msg)

    if document_ids is None:
        if analysis.analyzed_corpus is None:
            raise ValueError(
                "If Analysis is not linked to a corpus, it must be linked to docs at "
                "run_task_name_analyzer() runtime..."
            )

        document_ids = list(
            analysis.analyzed_corpus.documents.values_list("id", flat=True)
        )

    logger.info(f"Added task {task_name} to queue: {task_func}")

    transaction.on_commit(
        lambda: chord(
            group(
                [
                    task_func.s(doc_id=doc_id, analysis_id=analysis.id)
                    for doc_id in document_ids
                ]
            )
        )(mark_analysis_complete.si(analysis_id=analysis.id, doc_ids=document_ids))
    )


def process_analyzer(
    user_id: int | str,
    analyzer: Analyzer | None,
    corpus_id: str | int | None = None,
    document_ids: list[str | int] | None = None,
    corpus_action: CorpusAction | None = None,
) -> Analysis:

    analysis = create_and_setup_analysis(
        analyzer,
        user_id,
        corpus_id=corpus_id,
        doc_ids=document_ids,
        corpus_action=corpus_action,
    )
    print(f"process_analyzer(...) - created analysis: {analysis}")

    if analyzer.task_name:

        run_task_name_analyzer.si(
            analysis_id=analysis.id,
            document_ids=document_ids,
        ).apply_async()

    else:
        logger.info(f" - retrieved analysis: {analysis}")
        start_analysis.s(analysis_id=analysis.id, doc_ids=document_ids).apply_async()

    return analysis


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

        if action.fieldset:

            tasks = []

            with transaction.atomic():
                extract, created = Extract.objects.get_or_create(
                    corpus=action.corpus,
                    name=f"Action {action.name} for {action.corpus.title}",
                    fieldset=action.fieldset,
                    creator_id=user_id,
                    corpus_action=action,
                )
                extract.started = timezone.now()

                if created:
                    extract.finished = None

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

            process_analyzer(
                user_id=user_id,
                analyzer=action.analyzer,
                corpus_id=corpus_id,
                document_ids=document_ids,
                corpus_action=action,
            )

        else:
            raise ValueError(
                "Unexpected action configuration... no analyzer or fieldset."
            )

    return True
