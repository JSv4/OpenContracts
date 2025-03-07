import logging
from typing import Optional

import marvin
from celery import chord, group, shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from opencontractserver.documents.models import DocumentAnalysisRow
from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.celery_tasks import get_task_by_name
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY


@shared_task
def mark_extract_complete(extract_id):
    extract = Extract.objects.get(pk=extract_id)
    extract.finished = timezone.now()
    extract.save()


@shared_task
def run_extract(extract_id: Optional[str | int], user_id: str | int):
    logger.info(f"Run extract for extract {extract_id}")

    logger.info(f"Fetching extract with ID: {extract_id}")
    extract = Extract.objects.get(pk=extract_id)
    logger.info(f"Found extract: {extract.name} (ID: {extract.id})")

    logger.info(f"Setting started timestamp for extract {extract.id}")
    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()
        logger.info(f"Extract {extract.id} marked as started at {extract.started}")

    fieldset = extract.fieldset
    logger.info(f"Using fieldset: {fieldset.name} (ID: {fieldset.id})")

    logger.info(f"Retrieving document IDs for extract {extract.id}")
    document_ids = extract.documents.all().values_list("id", flat=True)
    logger.info(f"Found {len(document_ids)} documents to process: {list(document_ids)}")

    tasks = []
    logger.info(f"Beginning document processing loop for extract {extract.id}")

    for document_id in document_ids:
        logger.info(f"Processing document ID: {document_id} for extract {extract.id}")

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
    logger.info(f"Extract processing initiated for extract {extract.id}")
