import json

from celery import shared_task
from django.db import transaction
from django.utils import timezone
from pgvector.django import L2Distance

from opencontractserver.annotations.models import Annotation
from opencontractserver.extracts.models import Extract, Row
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.utils.embeddings import calculate_embedding_for_text


# Mock these functions for now
def agent_fetch_my_definitions(annot):
    return []


def extract_for_query(annots, query, output_type):
    print(f"Ran extract_for_query")
    return None


@shared_task
def run_extract(extract_id, user_id):

    print(f"Run extract for extract {extract_id}")

    extract = Extract.objects.get(pk=extract_id)

    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()

    corpus = extract.corpus
    fieldset = extract.fieldset

    document_ids = corpus.documents.all().values_list("id", flat=True)
    print(f"Document ids: {document_ids}")

    for document_id in document_ids:
        for column in fieldset.columns.all():

            print(f"Processing column {column} for doc {document_id}")

            with transaction.atomic():
                row = Row.objects.create(
                    extract=extract,
                    column=column,
                    data_definition=column.output_type,
                    creator_id=user_id
                )
                set_permissions_for_obj_to_user(user_id, row, [PermissionTypes.CRUD])

            try:
                print(f"run_extract() - processing column {column} for {document_id}")
                row.started = timezone.now()
                row.save()

                output_type = eval(column.output_type)
                print(f"output_type: {output_type}")

                annotations = Annotation.objects.filter(
                    document_id=document_id, embedding__isnull=False
                )

                if column.limit_to_label:
                    annotations = annotations.filter(
                        annotation_label__text=column.limit_to_label
                    )

                match_text = column.match_text or column.query
                print(f"Match_text: {match_text}")

                if match_text:

                    # need to generate embeddings here
                    natural_lang_embeddings = calculate_embedding_for_text(match_text)

                    # Find closest 5 annotations
                    annotations = annotations.order_by(
                        L2Distance("embedding", natural_lang_embeddings)
                    )[:5]

                if column.agentic:
                    annotations = annotations.union(agent_fetch_my_definitions(annotations))

                print(f"Prepare to extract_for_query annotations {annotations} / column {column.query} / {output_type}")
                val = extract_for_query(annotations, column.query, output_type)
                print(f"Extracted value: {val}")

                row.data = {"data": val}
                row.completed = timezone.now()
                row.save()

            except Exception as e:
                print(f"Ran into error: {e}")
                row.stacktrace = f"Error processing: {e}"
                row.failed = timezone.now()
                row.save()
