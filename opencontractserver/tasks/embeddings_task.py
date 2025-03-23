import logging
from typing import Union

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model

# from config import celery_app
from opencontractserver.annotations.models import Annotation, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.utils import (
    find_embedder_for_filetype,
    get_component_by_name,
    get_default_embedder,
)
from opencontractserver.utils.embeddings import generate_embeddings_from_text

User = get_user_model()

logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)


def get_embedder_for_corpus(
    corpus_id: int | str = None, mimetype_or_enum: Union[str, FileTypeEnum] = None
) -> tuple[type[BaseEmbedder], str]:
    """
    Get the appropriate embedder for a corpus.

    Args:
        corpus_id: The ID of the corpus
        mimetype_or_enum: The MIME type of the document or a FileTypeEnum (used as fallback)

    Returns:
        A tuple of (embedder_class, embedder_path)
    """
    embedder_class = None
    embedder_path = None

    # Try to get the corpus's preferred embedder
    if corpus_id:
        try:
            corpus = Corpus.objects.get(id=corpus_id)
            if corpus.preferred_embedder:
                try:
                    embedder_class = get_component_by_name(corpus.preferred_embedder)
                    embedder_path = corpus.preferred_embedder
                except Exception:
                    # If we can't load the preferred embedder, fall back to mimetype
                    pass
        except Exception:
            # If corpus doesn't exist, fall back to mimetype
            pass

    # If no corpus-specific embedder was found and a mimetype is provided,
    # try to find an appropriate embedder for the mimetype
    if embedder_class is None and mimetype_or_enum:

        # Find an embedder for the mimetype and dimension
        embedder_class = find_embedder_for_filetype(mimetype_or_enum)
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"

    # Fall back to default embedder if no specific embedder is found
    if embedder_class is None:
        embedder_class = get_default_embedder()
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"

    return embedder_class, embedder_path


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_doc_text(
    self, doc_id: Union[str, int], corpus_id: Union[str, int]
) -> None:
    """
    Calculate embeddings for the text extracted from a document, using its associated corpus.
    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        doc_id (str | int): ID of the document.
        corpus_id (str | int): ID of the corpus to use for embedding.
    """
    try:
        doc = Document.objects.get(id=doc_id)

        if doc.txt_extract_file.name:
            with doc.txt_extract_file.open("r") as txt_file:
                text = txt_file.read()
        else:
            text = ""

        corpus = Corpus.objects.get(id=corpus_id)
        embedder_path, embeddings = corpus.embed_text(text)
        doc.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_doc_text() - failed to generate embeddings due to error: {e}"
        )
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_annotation_text(
    self, annotation_id: Union[str, int], embedder_path: str = None
) -> None:
    """
    Calculate embeddings for an annotation's text.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        annotation_id (str | int): ID of the annotation
        embedder_path (str, optional): Optional explicit embedder path to use (highest precedence)
    """
    try:
        annotation = Annotation.objects.get(pk=annotation_id)
    except Annotation.DoesNotExist:
        logger.warning(f"Annotation {annotation_id} not found.")
        return

    corpus_id = annotation.corpus_id  # if your annotation references a corpus
    text = annotation.raw_text or ""
    if not text.strip():
        logger.info(f"Annotation {annotation_id} has no raw_text to embed.")
        return

    # If we want to override the embedder path, do so. If not, generate_embeddings_from_text
    # will figure out from the corpus or fallback to default microservice or embedder.
    returned_path, vector = generate_embeddings_from_text(text, corpus_id=corpus_id)

    if vector is None:
        logger.error(
            f"Embedding could not be generated for annotation {annotation_id}."
        )
        return

    # If user explicitly requested an embedder path override, replace
    # the path from the function's defaults:
    final_path = embedder_path if embedder_path else returned_path

    # Now store the embedding
    annotation.add_embedding(final_path or "unknown-embedder", vector)
    logger.info(
        f"Embedding for Annotation {annotation_id} stored using path: {final_path}, dimension={len(vector)}."
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_note_text(self, note_id: Union[str, int]) -> None:
    """
    Calculate embeddings for the text in a Note object, possibly falling back to a default embedder.
    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        note_id (str | int): ID of the note.
    """
    try:
        note = Note.objects.get(id=note_id)
        text = note.content

        if not isinstance(text, str) or len(text) == 0:
            logger.warning(f"Note with ID {note_id} has no content or is not a string")
            return

        try:
            embedder_path, embeddings = note.corpus.embed_text(text)
        except Exception as e:
            logger.warning(
                f"Failed to use corpus embedder: {e}. Falling back to default embedder."
            )
            embedder_path = settings.DEFAULT_EMBEDDER
            embedder_class = get_default_embedder()
            embedder = embedder_class()  # Create an instance
            embeddings = embedder.embed_text(text)

        note.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_note_text() - failed to generate embeddings due to error: {e}"
        )
        raise
