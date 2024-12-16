import logging
from typing import Optional

import numpy as np
import requests
from django.conf import settings

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class MicroserviceEmbedder(BaseEmbedder):
    """
    Embedder that generates embeddings by calling an external microservice.
    """

    title = "Microservice Embedder"
    description = "Generates embeddings using a vector embeddings microservice."
    author = "Your Name"
    dependencies = ["numpy", "requests"]
    vector_size = 768  # Adjust based on actual embedding size
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
        # Add more as needed
    ]

    def embed_text(self, text: str) -> Optional[list[float]]:
        """
        Generates embeddings from text using the microservice.

        Args:
            text (str): The text content to embed.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats,
            or None if an error occurs.
        """
        try:
            response = requests.post(
                f"{settings.EMBEDDINGS_MICROSERVICE_URL}/embeddings",
                json={"text": text},
                headers={"X-API-Key": settings.VECTOR_EMBEDDER_API_KEY},
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                if np.isnan(embeddings_array).any():
                    logger.error("Embedding contains NaN values")
                    return None
                else:
                    return embeddings_array[0].tolist()
            else:
                logger.error(
                    f"Microservice returned status code {response.status_code}"
                )
                return None
        except Exception as e:
            logger.error(
                f"MicroserviceEmbedder - failed to generate embeddings due to error: {e}"
            )
            return None
