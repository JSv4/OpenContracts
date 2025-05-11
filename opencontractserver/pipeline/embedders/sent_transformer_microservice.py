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
    vector_size = 384  # Default embedding size
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
        # Add more as needed
    ]

    def __init__(self, **kwargs):
        """Initializes the MicroserviceEmbedder."""
        super().__init__(**kwargs)
        logger.info("MicroserviceEmbedder initialized.")
        # Potentially load EMBEDDINGS_MICROSERVICE_URL and VECTOR_EMBEDDER_API_KEY from self.get_component_settings() here
        # if they are to be configured via PIPELINE_SETTINGS. For now, they are read from django.conf.settings directly.

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generates embeddings from text using the microservice.

        Args:
            text (str): The text content to embed.
            **all_kwargs: Additional keyword arguments. Currently unused by this specific embedder
                          but included for consistency with the base class. Potential settings
                          like microservice URL or API key could be passed here if desired.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats,
            or None if an error occurs.
        """
        logger.debug(f"MicroserviceEmbedder received text for embedding. Effective kwargs: {all_kwargs}")
        try:
            # Settings like EMBEDDINGS_MICROSERVICE_URL and VECTOR_EMBEDDER_API_KEY are currently
            # sourced from django.conf.settings directly. They could be made configurable
            # via all_kwargs if needed by modifying the lines below.
            service_url = all_kwargs.get("embeddings_microservice_url", settings.EMBEDDINGS_MICROSERVICE_URL)
            api_key = all_kwargs.get("vector_embedder_api_key", settings.VECTOR_EMBEDDER_API_KEY)

            response = requests.post(
                f"{service_url}/embeddings",
                json={"text": text},
                headers={"X-API-Key": api_key},
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
