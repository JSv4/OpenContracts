import logging
import os
from typing import Optional

from sentence_transformers import SentenceTransformer

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)


class CloudMinnModernBERTEmbedder(BaseEmbedder):
    """
    Embedder that uses the Minnesota Case Law ModernBERT model to generate embeddings
    by calling a Hugging Face Inference Endpoint.

    This embedder does not load a local model. Instead, it sends the input text to a
    provided endpoint for inference, returning 768-dimensional embeddings.
    """

    title = "Cloud Minnesota Case Law ModernBERT Embedder"
    description = (
        "Generates embeddings by calling the Minnesota Case Law ModernBERT model "
        "through a HF Inference Endpoint. This embedder does not load a local model. "
        "Instead, it sends the input text to a provided endpoint for inference, "
        "returning 768-dimensional embeddings."
    )
    author = "OpenContracts"
    dependencies = ["requests>=2.28.0"]  # Additional dependency for HTTP requests
    vector_size = 768  # Output dimensionality of the model
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
        # FileTypeEnum.HTML,  # Removed as we don't support HTML
    ]

    def __init__(self, **kwargs_super):
        """
        Initialize the CloudMinnModernBERTEmbedder.

        Prepares API URL and headers for calling the HF Inference Endpoint.
        """
        super().__init__(**kwargs_super)
        import requests  # Inline import to avoid global if not already available
        from django.conf import settings

        self.requests = requests
        
        # Get settings from component_settings or use Django settings as fallback
        component_settings = self.get_component_settings()
        self.api_url = component_settings.get("hf_embeddings_endpoint", settings.HF_EMBEDDINGS_ENDPOINT)
        hf_token = component_settings.get("hf_token", settings.HF_TOKEN)  # Use the token from settings

        self.headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {hf_token}",
            "Content-Type": "application/json",
        }

    def _load_model(self):
        """
        Placeholder for compatibility with BaseEmbedder.

        In this embedder, no local model is loaded; inference is done via an external API call.
        """
        pass

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate embeddings for the given text using an external HF Inference Endpoint.

        Args:
            text: The text to embed.
            **all_kwargs: Additional arguments to pass along in the request payload if needed.

        Returns:
            A list of floats representing the embedding vector, or None if an error occurs.
        """
        logger.debug(f"CloudMinnModernBERTEmbedder received text for embedding. Effective kwargs: {all_kwargs}")
        try:
            # Handle empty text
            if not text or not text.strip():
                logger.warning("Empty text provided for embedding")
                return [0.0] * self.vector_size

            # Prepare payload
            payload = {
                "inputs": text,
                # The HF Inference API often allows "parameters" for custom settings,
                # we include all_kwargs inside "parameters" as a best-effort approach:
                "parameters": all_kwargs,
            }

            response = self.requests.post(
                self.api_url, headers=self.headers, json=payload
            )
            if response.status_code != 200:
                logger.error(f"Error from HF endpoint: {response.text}")
                return None

            data = response.json()

            # Expecting the endpoint to return a dictionary with the embedding.
            # Adjust accordingly if the actual HF endpoint returns differently.
            embedding = data.get("embeddings")
            if not embedding or not isinstance(embedding, list):
                logger.error("No valid embedding returned from HF endpoint.")
                return None

            return embedding

        except Exception as e:
            logger.error(f"Error generating embeddings via HF endpoint: {e}")
            return None


class MinnModernBERTEmbedder(BaseEmbedder):
    """
    Embedder that uses the Minnesota Case Law ModernBERT model to generate embeddings.

    This embedder uses the sentence-transformers library with the conceptofmind/teraflop-minn-caselaw
    model to generate 768-dimensional embeddings for text.
    """

    title = "Minnesota Case Law ModernBERT Embedder"
    description = "Generates embeddings using the Minnesota Case Law ModernBERT model."
    author = "OpenContracts"
    dependencies = ["sentence-transformers>=2.2.2", "torch>=2.0.0"]
    vector_size = 768  # Output dimensionality of the model
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
        # FileTypeEnum.HTML,  # Removed as we don't support HTML
    ]

    def __init__(self, **kwargs_super):
        """Initialize the Minnesota Case Law ModernBERT embedder."""
        super().__init__(**kwargs_super)
        self.model = None
        
        # Get settings from component_settings or use defaults
        component_settings = self.get_component_settings()
        self.model_name = component_settings.get("model_name", "conceptofmind/teraflop-minn-caselaw")
        self.cache_dir = component_settings.get("cache_dir", "/models")
        # Adjust vector_size if provided in settings, otherwise keep the class default
        self.vector_size = component_settings.get("vector_size", self.vector_size)

        # model_path is derived from cache_dir and a fixed subdir for sentence-transformers structure
        model_name_suffix = self.model_name.split("/")[-1]
        self.model_path = os.path.join(
            self.cache_dir, "sentence-transformers", model_name_suffix
        )
        logger.info(f"MinnModernBERTEmbedder initialized. Model: {self.model_name}, Cache: {self.cache_dir}, Vector Size: {self.vector_size}")

    def _load_model(self):
        """Load the sentence transformer model if not already loaded."""
        if self.model is None:
            try:
                # First try to load from the cached path
                if os.path.exists(self.model_path):
                    logger.info(
                        f"Loading Minnesota Case Law ModernBERT model from cache: {self.model_path}"
                    )
                    self.model = SentenceTransformer(self.model_path)
                else:
                    # If not cached, download from Hugging Face
                    logger.info(
                        f"Loading Minnesota Case Law ModernBERT model from Hugging Face: {self.model_name}"
                    )
                    self.model = SentenceTransformer(self.model_name)

                logger.info("Minnesota Case Law ModernBERT model loaded successfully")
            except Exception as e:
                logger.error(f"Error loading Minnesota Case Law ModernBERT model: {e}")
                raise

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate embeddings for the given text using the Minnesota Case Law ModernBERT model.

        Args:
            text: The text to embed
            **all_kwargs: Additional arguments to pass to the model, potentially from PIPELINE_SETTINGS.

        Returns:
            A list of floats representing the embedding vector, or None if an error occurs
        """
        logger.debug(f"MinnModernBERTEmbedder received text for embedding. Effective kwargs: {all_kwargs}")
        try:
            # Load the model if not already loaded
            self._load_model()

            # Handle empty text
            if not text or not text.strip():
                logger.warning("Empty text provided for embedding")
                return [0.0] * self.vector_size

            # Generate embeddings
            # Pass all_kwargs, which might include specific encoding parameters like batch_size, show_progress_bar etc.
            embedding = self.model.encode(text, **all_kwargs)

            # Convert to list of floats
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return None
