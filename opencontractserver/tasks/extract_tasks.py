import json

from celery import shared_task
from django.db import transaction
from django.utils import timezone
from pgvector.django import L2Distance

from opencontractserver.annotations.models import Annotation
from opencontractserver.extracts.models import Extract, Row
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user


# Mock these functions for now
def agent_fetch_my_definitions(annot):
    return []


def extract_for_query(annots, query, output_type):
    return None


@shared_task
def run_extract(extract_id, user_id):
    extract = Extract.objects.get(pk=extract_id)

    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()

    corpus = extract.corpus
    fieldset = extract.fieldset

    document_ids = corpus.documents.values_list("id", flat=True)

    for document_id in document_ids:
        for column in fieldset.columns.all():
            with transaction.atomic():
                row = Row.objects.create(
                    extract=extract, column=column, data_definition=column.output_type
                )
                set_permissions_for_obj_to_user(user_id, row, [PermissionTypes.CRUD])

            try:
                row.started = timezone.now()
                row.save()

                output_type = eval(column.output_type)

                annotations = Annotation.objects.filter(
                    document_id=document_id, embedding__isnull=False
                )

                if column.limit_to_label:
                    annotations = annotations.filter(
                        annotation_label__text=column.limit_to_label
                    )

                match_text = column.match_text or column.query

                if match_text:
                    # Find closest annotations
                    annotations = annotations.order_by(
                        L2Distance("embedding", match_text)
                    )[:5]

                if column.agentic:
                    annotations |= agent_fetch_my_definitions(annotations)

                val = extract_for_query(annotations, column.query, output_type)

                row.data = json.dumps({"data": val})
                row.completed = timezone.now()

            except Exception as e:
                row.stacktrace = f"Error processing: {e}"
                row.failed = timezone.now()
                row.save()
