import logging
from typing import Optional, Union

import numpy
import numpy as np
import requests
from django.conf import settings

from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def calculate_embedding_for_text(
    text: str,
    corpus_id: Optional[int] = None,
    mimetype: Optional[Union[str, FileTypeEnum]] = None,
) -> Optional[list[float | int]]:
    """
    Calculate embeddings for text, using corpus-specific embedder if provided.

    Args:
        text: The text to embed
        corpus_id: Optional corpus ID to get the preferred embedder
        mimetype: Optional MIME type or FileTypeEnum of the document

    Returns:
        Optional list of floats representing the embedding vector
    """
    # If corpus_id is provided, try to get the corpus-specific embedder
    vector_size = None
    if corpus_id:
        try:
            from opencontractserver.tasks.embeddings_task import get_embedder_for_corpus

            embedder_class, _ = get_embedder_for_corpus(corpus_id, mimetype)
            if embedder_class and hasattr(embedder_class, "vector_size"):
                vector_size = embedder_class.vector_size
        except Exception as e:
            logger.error(f"Error getting embedder for corpus {corpus_id}: {e}")

    # Try to get natural lang text and create embeddings
    natural_lang_embeddings = None
    try:
        # Prepare the request payload
        payload = {"text": text}
        if vector_size:
            payload["vector_size"] = vector_size

        response = requests.post(
            f"{settings.EMBEDDINGS_MICROSERVICE_URL}/embeddings",
            json=payload,
            headers={"X-API-Key": settings.VECTOR_EMBEDDER_API_KEY},
        )

        if response.status_code == 200:
            natural_lang_embeddings = np.array(response.json()["embeddings"])
            nan_mask = numpy.isnan(natural_lang_embeddings)
            any_nan = numpy.any(nan_mask)
            if any_nan:
                natural_lang_embeddings = None
            else:
                natural_lang_embeddings = natural_lang_embeddings[0]
    except Exception as e:
        logger.error(
            f"calculate_embedding_for_text() - failed to generate embeddings due to error: {e}"
        )

    return natural_lang_embeddings
