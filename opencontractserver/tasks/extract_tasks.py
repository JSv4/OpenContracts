import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone
from pgvector.django import L2Distance

from opencontractserver.annotations.models import Annotation
from opencontractserver.extracts.models import Datacell, Extract
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.embeddings import calculate_embedding_for_text
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


# Mock these functions for now
def agent_fetch_my_definitions(annot):
    return []


def extract_for_query(annots, query, output_type):
    return None


@shared_task
def run_extract(extract_id, user_id):

    logger.info(f"Run extract for extract {extract_id}")

    extract = Extract.objects.get(pk=extract_id)

    with transaction.atomic():
        extract.started = timezone.now()
        extract.save()

    corpus = extract.corpus
    fieldset = extract.fieldset

    document_ids = corpus.documents.all().values_list("id", flat=True)
    datacell_ids = []

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
                datacell_ids.append(cell.pk)

                # Kick off processing job for cell in queue as soon as it's created.
                llama_index_doc_query.si(cell.pk).apply_async()


@shared_task
def llama_index_doc_query(cell_id):
    """
    Use LlamaIndex to run queries specified for a particular cell
    """

    datacell = Datacell.objects.get(id=cell_id)

    try:
        logger.debug(
            f"run_extract() - processing column datacell {datacell.id} for {datacell.document.id}"
        )
        datacell.started = timezone.now()
        datacell.save()

        output_type = eval(datacell.column.output_type)

        # TODO - integrate LlamaIndex code

        annotations = Annotation.objects.filter(
            document_id=datacell.document.id, embedding__isnull=False
        )

        if datacell.column.limit_to_label:
            annotations = annotations.filter(
                annotation_label__text=datacell.column.limit_to_label
            )

        match_text = datacell.column.match_text or datacell.column.query

        if match_text:
            # need to generate embeddings here
            natural_lang_embeddings = calculate_embedding_for_text(match_text)

            # Find closest 5 annotations
            annotations = annotations.order_by(
                L2Distance("embedding", natural_lang_embeddings)
            )[:5]

        if datacell.column.agentic:
            # TODO - use different query code
            annotations = annotations.union(agent_fetch_my_definitions(annotations))

        val = extract_for_query(annotations, datacell.column.query, output_type)

        datacell.data = {"data": val}
        datacell.completed = timezone.now()
        datacell.save()

    except Exception as e:
        logger.error(f"run_extract() - Ran into error: {e}")
        datacell.stacktrace = f"Error processing: {e}"
        datacell.failed = timezone.now()
        datacell.save()
