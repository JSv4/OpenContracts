import logging

from config import celery_app
from django.conf import settings
from opencontractserver.annotations.models import Annotation, Embedding, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.utils import (
    find_embedder_for_filetype_and_dimension,
    get_component_by_name,
    get_default_embedder,
    get_dimension_from_embedder,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def get_embedder_for_corpus(corpus_id: int | str = None, mimetype: str = None) -> tuple[type[BaseEmbedder], str]:
    """
    Get the appropriate embedder for a corpus.
    
    Args:
        corpus_id: The ID of the corpus
        mimetype: The MIME type of the document (used as fallback)
        
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
    if embedder_class is None and mimetype:
        # If we have a corpus embedder path but couldn't load it, try to get its dimension
        dimension = None
        if corpus_id and embedder_path:
            try:
                dimension = get_dimension_from_embedder(embedder_path)
            except Exception:
                pass
        
        # Find an embedder for the mimetype and dimension
        embedder_class = find_embedder_for_filetype_and_dimension(mimetype, dimension)
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"
    
    # Fall back to default embedder if no specific embedder is found
    if embedder_class is None:
        embedder_class = get_default_embedder()
        if embedder_class:
            embedder_path = f"{embedder_class.__module__}.{embedder_class.__name__}"
    
    return embedder_class, embedder_path


def store_embeddings(embedder: BaseEmbedder, text: str, embedder_path: str) -> Embedding:
    """
    Generate and store embeddings for text using the specified embedder.
    
    Args:
        embedder: The embedder instance
        text: The text to embed
        embedder_path: The path to the embedder class
        
    Returns:
        The created Embedding object
    """
    embedding_obj = Embedding(embedder_path=embedder_path)
    
    # Generate embeddings
    embeddings = embedder.embed_text(text)
    
    if embeddings:
        # Store the embeddings in the appropriate field based on dimension
        vector_size = embedder.vector_size
        if vector_size == 384:
            embedding_obj.vector_384 = embeddings
        elif vector_size == 768:
            embedding_obj.vector_768 = embeddings
        elif vector_size == 1536:
            embedding_obj.vector_1536 = embeddings
        elif vector_size == 3072:
            embedding_obj.vector_3072 = embeddings
        else:
            logger.warning(f"Unsupported vector size: {vector_size}")
    
    embedding_obj.save()
    return embedding_obj


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

        # Get the document's mimetype
        mimetype = doc.file_type
        corpus_id = None
        
        # Check if the document is part of any corpus and use that corpus's embedder
        corpus_set = doc.corpus_set.all()
        if corpus_set.exists():
            # Use the first corpus for now - could be enhanced to handle multiple corpuses
            corpus_id = corpus_set.first().id

        # Get the embedder based on corpus and mimetype
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id, mimetype)
            
        if embedder_class is None:
            logger.error(f"No embedder found for document: {doc_id}")
            return

        embedder: BaseEmbedder = embedder_class()
        
        # For now, just store in the document's embedding field
        # In the future, we could create an Embedding object and link it
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
        corpus_id = annot.corpus_id if annot.corpus else None

        # Get the embedder based on the corpus configuration
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id)
        
        if embedder_class is None:
            logger.error("No embedder found for annotation")
            return

        embedder: BaseEmbedder = embedder_class()
        
        # Create a new Embedding object
        embedding_obj = store_embeddings(embedder, text, embedder_path)
        
        # For backward compatibility, also store in the legacy field
        annot.embedding = embedder.embed_text(text)
        
        # Link the new embedding object
        annot.embeddings = embedding_obj
        annot.save()

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
        corpus_id = note.corpus_id if note.corpus else None

        # Get the embedder based on the corpus configuration
        embedder_class, embedder_path = get_embedder_for_corpus(corpus_id)
        
        if embedder_class is None:
            logger.error("No embedder found for note")
            return

        embedder: BaseEmbedder = embedder_class()
        
        # Create a new Embedding object
        embedding_obj = store_embeddings(embedder, text, embedder_path)
        
        # For backward compatibility, also store in the legacy field
        note.embedding = embedder.embed_text(text)
        
        # Link the new embedding object
        note.embeddings = embedding_obj
        note.save()

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_note_text() - failed to generate embeddings due to error: {e}"
        )
