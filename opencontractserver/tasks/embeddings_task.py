import logging

from config import celery_app
from opencontractserver.annotations.models import Annotation
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.utils import (
    get_default_embedder,
    get_preferred_embedder,
)

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

        # Get the preferred embedder for the document's mimetype
        mimetype = doc.mime_type

        # Get the preferred embedder based on mimetype
        embedder_class = get_preferred_embedder(mimetype)
        if embedder_class is None:
            logger.error(f"No embedder found for mimetype: {mimetype}")
            return

        embedder: BaseEmbedder = embedder_class()
        embeddings = embedder.embed_text(text)
        doc.embedding = embeddings
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

        # Get the default embedder since annotations may not have a mimetype
        embedder_class = get_default_embedder()
        if embedder_class is None:
            logger.error("No default embedder found")
            return

        embedder: BaseEmbedder = embedder_class()
        embeddings = embedder.embed_text(text)
        annot.embedding = embeddings
        annot.save()

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_annotation_text() - failed to generate embeddings due to error: {e}"
        )
