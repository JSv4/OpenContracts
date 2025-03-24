from datetime import time
import logging
from typing import Optional, Union


from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def get_embedder(
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
    
    from opencontractserver.pipeline.utils import find_embedder_for_filetype, get_default_embedder, get_component_by_name
    from opencontractserver.corpuses.models import Corpus

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


def generate_embeddings_from_text(
    text: str,
    corpus_id: Optional[int] = None,
    mimetype: Optional[Union[str, "FileTypeEnum"]] = None,
) -> tuple[Optional[str], Optional[list[float]]]:
    """
    Unified function to generate embeddings for a given text, optionally using
    the corpus's configured embedder class if available, otherwise falling
    back to an external embeddings microservice (or default embedder) as needed.

    Args:
        text (str): The text to embed.
        corpus_id (Optional[int]): ID of the corpus to retrieve embedder configuration from.
        mimetype (Optional[Union[str, FileTypeEnum]]): MIME type or file type for specialized embedding logic.

    Returns:
        Tuple[Optional[str], Optional[List[float]]]:
            - The embedder_path that was used (or None if not found).
            - The list of floats representing the embedding vector (or None on error).
    """
    if not text.strip():
        logger.warning(f"generate_embeddings_from_text() - text is empty or whitespace for corpus_id {corpus_id}")
        return None, None

    logger.info(f"Generating embeddings for text of length {len(text)} with corpus_id={corpus_id}, mimetype={mimetype}")
    
    embedder_class, embedder_path = get_embedder(corpus_id, mimetype)
    logger.debug(f"Selected embedder: class={embedder_class.__name__ if embedder_class else None}, path={embedder_path}")

    # If we found a valid Python embedder class with an embed_text method, use it.
    if embedder_class:
        try:
            logger.info(f"Initializing embedder instance of {embedder_class.__name__}")
            embedder_instance = embedder_class()
            
            logger.info(f"Embedding text with {embedder_class.__name__}")
            start_time = time.time()
            vector = embedder_instance.embed_text(text)  # type: ignore
            elapsed_time = time.time() - start_time
            
            if vector is not None:
                vector_dim = len(vector) if isinstance(vector, list) else "unknown"
                logger.info(f"Successfully generated embedding with dimension={vector_dim} in {elapsed_time:.2f}s")
            else:
                logger.warning(f"Embedder {embedder_class.__name__} returned None vector")
                
            return embedder_path, vector
        except Exception as e:
            logger.error(
                f"Failed to generate embeddings via embedder class {embedder_class.__name__}: {e}"
            )
            logger.exception("Detailed embedding generation error:")

    logger.warning(f"No suitable embedder found or embedding generation failed for corpus_id={corpus_id}")
    return None, None


def calculate_embedding_for_text(
    text: str,
    corpus_id: Optional[int] = None,
    mimetype: Optional[Union[str, "FileTypeEnum"]] = None,
) -> Optional[list[float]]:
    """
    DEPRECATED (but kept for backward compatibility):
    Please use generate_embeddings_from_text(...) directly.
    This function calls generate_embeddings_from_text and returns only the vector.
    """
    _, embeddings = generate_embeddings_from_text(text, corpus_id, mimetype)
    return embeddings
