import logging
from typing import Callable, Optional

import marvin
from celery import chord, group, shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from config import celery_app
from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY


def get_task_by_name(task_name) -> Optional[Callable]:
    """
    Try to get celery task function Callable by name
    """
    try:
        return celery_app.tasks.get(task_name)
    except Exception:
        return None


@shared_task
def mark_extract_complete(extract_id):
    extract = Extract.objects.get(pk=extract_id)
    extract.finished = timezone.now()
    extract.save()


@shared_task
def run_extract(extract_id, user_id):
    logger.info(f"Run extract for extract {extract_id}")

    extract = Extract.objects.get(pk=extract_id)

    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()

    fieldset = extract.fieldset

    document_ids = extract.documents.all().values_list("id", flat=True)
    print(f"Run extract {extract_id} over document ids {document_ids}")
    tasks = []

    for document_id in document_ids:

        row_results = DocumentAnalysisRow(
            document_id=document_id, extract_id=extract_id, creator=extract.creator
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
                set_permissions_for_obj_to_user(user_id, cell, [PermissionTypes.CRUD])

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

    chord(group(*tasks))(mark_extract_complete.si(extract_id))
