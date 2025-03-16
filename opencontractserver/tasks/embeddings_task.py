import logging
from typing import Union

from django.contrib.auth import get_user_model

from config import celery_app
from opencontractserver.annotations.models import Annotation, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.utils import (
    find_embedder_for_filetype_and_dimension,
    get_component_by_name,
    get_default_embedder,
    get_dimension_from_embedder,
)

User = get_user_model()

logger = logging.getLogger(__name__)
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
        # If we have a corpus embedder path but couldn't load it, try to get its dimension
        dimension = None
        if corpus_id and embedder_path:
            try:
                dimension = get_dimension_from_embedder(embedder_path)
            except Exception:
                pass

        # Find an embedder for the mimetype and dimension
        embedder_class = find_embedder_for_filetype_and_dimension(
            mimetype_or_enum, dimension
        )
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"

    # Fall back to default embedder if no specific embedder is found
    if embedder_class is None:
        embedder_class = get_default_embedder()
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"

    return embedder_class, embedder_path


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def calculate_embedding_for_doc_text(doc_id: str | int, corpus_id: str | int):
    try:
        doc = Document.objects.get(id=doc_id)

        if doc.txt_extract_file.name:
            with doc.txt_extract_file.open("r") as txt_file:
                text = txt_file.read()
        else:
            text = ""

        # Check if the document is part of any corpus and use that corpus's embedder
        corpus = Corpus.objects.get(id=corpus_id)
        embedder_path, embeddings = corpus.embed_text(text)
        doc.add_embedding(embedder_path, embeddings)

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
        corpus_id = annot.corpus_id if annot.corpus else None
        corpus = Corpus.objects.get(id=corpus_id)
        embedder_path, embeddings = corpus.embed_text(text)
        annot.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_annotation_text() - failed to generate embeddings due to error: {e}"
        )


@celery_app.task(
    autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5}
)
def calculate_embedding_for_note_text(note_id: str | int):
    try:
        note = Note.objects.get(id=note_id)
        text = note.content

        embedder_path, embeddings = note.corpus.embed_text(text)
        note.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_note_text() - failed to generate embeddings due to error: {e}"
        )
