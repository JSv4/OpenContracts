import logging

from config import celery_app
from opencontractserver.annotations.models import Annotation
from opencontractserver.documents.models import Document
from opencontractserver.utils.embeddings import calculate_embedding_for_text

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def calculate_embedding_for_doc_text(doc_id: str | int):

    try:
        doc = Document.objects.get(id=doc_id)

        if doc.txt_extract_file.name:
            with doc.txt_extract_file.open("r") as txt_file:
                text = txt_file.read()
        else:
            text = ""

        natural_lang_embeddings = calculate_embedding_for_text(text)
        doc.embedding = natural_lang_embeddings
        doc.save()

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_doc_text() - failed to generate embeddings due to error: {e}"
        )


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def calculate_embedding_for_annotation_text(annotation_id: str | int):
    try:
        annot = Annotation.objects.get(id=annotation_id)
        text = annot.raw_text
        natural_lang_embeddings = calculate_embedding_for_text(text)
        annot.embedding = natural_lang_embeddings
        annot.save()

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_annotation_text() - failed to generate embeddings due to error: {e}"
        )
