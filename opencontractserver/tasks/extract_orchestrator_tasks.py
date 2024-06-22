import logging

import marvin
from celery import chord, group, shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.tasks.data_extract_tasks import oc_llama_index_doc_query
from opencontractserver.types.enums import PermissionTypes
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

                # Kick off processing job for cell in queue as soon as it's created.
                tasks.append(oc_llama_index_doc_query.si(cell.pk))

    chord(group(*tasks))(mark_extract_complete.si(extract_id))


