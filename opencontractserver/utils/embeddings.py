import logging
from typing import Optional, Union

import numpy as np
import requests
from django.conf import settings

from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def get_embedder_for_corpus(
    corpus_id: int, mimetype: Optional[Union[str, "FileTypeEnum"]] = None
) -> tuple[Optional[type], Optional[str]]:
    """
    Retrieve the Python embedder class (if any) and embedder path for a given corpus.
    If none is found or specified, you can fall back to a default.

    Args:
        corpus_id (int): The ID of the corpus.
        mimetype (Optional[Union[str, FileTypeEnum]]): MIME type that might affect embedder choice.

    Returns:
        (embedder_class, embedder_path) - either may be None if no embedder is configured.
    """
    from opencontractserver.corpuses.models import Corpus

    embedder_class = None
    embedder_path = None

    try:
        corpus = Corpus.objects.get(pk=corpus_id)
        embedder_class = corpus.get_embedder_class()
        # The embedder_path is typically the FQ path of the embedder class
        # or some user-defined identifier from corpus.preferred_embedder
        if corpus.preferred_embedder:
            embedder_path = corpus.preferred_embedder
        else:
            embedder_path = settings.DEFAULT_EMBEDDER

    except Corpus.DoesNotExist:
        logger.warning(
            f"No corpus found with id={corpus_id}. Using fallback embedder path."
        )
        embedder_path = settings.DEFAULT_EMBEDDER

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
        return None, None

    embedder_class, embedder_path = get_embedder_for_corpus(corpus_id, mimetype)

    # If we found a valid Python embedder class with an embed_text method, use it.
    if embedder_class:
        try:
            embedder_instance = embedder_class()
            vector = embedder_instance.embed_text(text)  # type: ignore
            return embedder_path, vector
        except Exception as e:
            logger.error(
                f"Failed to generate embeddings via embedder class {embedder_class}: {e}"
            )

    # TODO - this needs attention. Possible removal.
    # If no embedder_class or it failed, deploy the microservice approach
    logger.debug("Falling back to the embeddings microservice for embedding text.")
    try:
        payload = {"text": text}
        # If the embedder_class has a vector_size, or we glean a dimension from the corpus,
        # we can pass that to the microservice:
        if embedder_class and hasattr(embedder_class, "vector_size"):
            payload["vector_size"] = embedder_class.vector_size

        response = requests.post(
            f"{settings.EMBEDDINGS_MICROSERVICE_URL}/embeddings",
            json=payload,
            headers={"X-API-Key": settings.VECTOR_EMBEDDER_API_KEY},
        )

        if response.status_code == 200:
            arr = np.array(response.json()["embeddings"])
            if not np.isnan(arr).any():
                # Typically shape is (1, D), so reduce to 1-D
                vector = arr[0].tolist()
                if embedder_path is None:
                    embedder_path = settings.DEFAULT_EMBEDDER
                return embedder_path, vector
            else:
                logger.error("Microservice returned NaN in embeddings array.")
    except Exception as e:
        logger.error(f"generate_embeddings_from_text() - failed via microservice: {e}")

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
