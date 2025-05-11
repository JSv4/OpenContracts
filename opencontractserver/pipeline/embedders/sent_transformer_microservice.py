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
        # Configuration for EMBEDDINGS_MICROSERVICE_URL and VECTOR_EMBEDDER_API_KEY
        # is determined within the _embed_text_impl method.
        # The order of precedence is:
        # 1. Direct keyword arguments passed to the embed_text() method (via all_kwargs).
        # 2. Settings from PIPELINE_SETTINGS for this specific component (via component_settings, then all_kwargs).
        # 3. Global Django settings (e.g., settings.EMBEDDINGS_MICROSERVICE_URL) as a final fallback.

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generates embeddings from text using the microservice.

        Args:
            text (str): The text content to embed.
            all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS (via self.get_component_settings())
                          and direct call-time arguments passed to embed_text().
                          Direct call-time arguments take precedence.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats,
            or None if an error occurs.
        """
        logger.debug(
            f"MicroserviceEmbedder received text for embedding. Effective kwargs: {all_kwargs}"
        )
        try:
            component_specific_settings = self.get_component_settings()

            # Determine the fallback for service_url:
            # 1. Check component-specific settings from PIPELINE_SETTINGS.
            # 2. If not found, use the global Django setting.
            service_url_fallback = component_specific_settings.get(
                "embeddings_microservice_url", settings.EMBEDDINGS_MICROSERVICE_URL
            )
            # `all_kwargs` (which is {**component_settings, **direct_kwargs}) is checked first.
            # If the key is present in `all_kwargs` (from direct_kwargs or component_settings), that value is used.
            # Otherwise, the calculated `service_url_fallback` is used.
            service_url = all_kwargs.get(
                "embeddings_microservice_url", service_url_fallback
            )

            # Determine the fallback for api_key similarly:
            api_key_fallback = component_specific_settings.get(
                "vector_embedder_api_key", settings.VECTOR_EMBEDDER_API_KEY
            )
            api_key = all_kwargs.get("vector_embedder_api_key", api_key_fallback)

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
