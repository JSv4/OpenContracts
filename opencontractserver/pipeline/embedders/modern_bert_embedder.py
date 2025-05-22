import logging
import os
from typing import Optional

from sentence_transformers import SentenceTransformer

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum

logger = logging.getLogger(__name__)


class ModernBERTEmbedder(BaseEmbedder):
    """
    Embedder that uses the ModernBERT sentence transformer model to generate embeddings.

    This embedder uses the sentence-transformers library with the answerdotai/ModernBERT-base
    model to generate 768-dimensional embeddings for text.
    """

    title = "ModernBERT Embedder"
    description = (
        "Generates embeddings using the ModernBERT sentence transformer model."
    )
    author = "OpenContracts"
    dependencies = ["sentence-transformers>=2.2.2", "torch>=2.0.0"]
    vector_size = 768  # Output dimensionality of the model
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
        # FileTypeEnum.HTML,  # Removed as we don't support HTML
    ]

    def __init__(self, **kwargs):
        """Initialize the ModernBERT embedder."""
        super().__init__(**kwargs)
        self.model = None

        # Get settings from component_settings or use defaults
        component_settings = self.get_component_settings()
        self.model_name = component_settings.get(
            "model_name", "answerdotai/ModernBERT-base"
        )
        self.cache_dir = component_settings.get("cache_dir", "/models")
        # Adjust vector_size if provided in settings, otherwise keep the class default
        self.vector_size = component_settings.get("vector_size", self.vector_size)

        # model_path is derived from cache_dir and a fixed subdir for sentence-transformers structure
        # The part 'ModernBERT-base' should ideally match the last part of self.model_name
        model_name_suffix = self.model_name.split("/")[-1]
        self.model_path = os.path.join(
            self.cache_dir, "sentence-transformers", model_name_suffix
        )
        logger.info(
            f"ModernBERTEmbedder initialized. Model: {self.model_name}, Cache: {self.cache_dir}, Vector Size: {self.vector_size}"  # noqa: E501
        )

    def _load_model(self):
        """Load the sentence transformer model if not already loaded."""
        if self.model is None:
            try:
                # First try to load from the cached path
                if os.path.exists(self.model_path):
                    logger.info(
                        f"Loading ModernBERT model from cache: {self.model_path}"
                    )
                    self.model = SentenceTransformer(self.model_path)
                else:
                    # If not cached, download from Hugging Face
                    logger.info(
                        f"Loading ModernBERT model from Hugging Face: {self.model_name}"
                    )
                    self.model = SentenceTransformer(self.model_name)

                logger.info("ModernBERT model loaded successfully")
            except Exception as e:
                logger.error(f"Error loading ModernBERT model: {e}")
                raise

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate embeddings for the given text using the ModernBERT model.

        Args:
            text: The text to embed
            **all_kwargs: Additional arguments to pass to the model, potentially from PIPELINE_SETTINGS.

        Returns:
            A list of floats representing the embedding vector, or None if an error occurs
        """
        logger.debug(
            f"ModernBERTEmbedder received text for embedding. Effective kwargs: {all_kwargs}"
        )
        try:
            # Load the model if not already loaded
            self._load_model()

            # Handle empty text
            if not text or not text.strip():
                logger.warning("Empty text provided for embedding")
                return [0.0] * self.vector_size

            # Generate embeddings
            embedding = self.model.encode(text, **all_kwargs)

            # Convert to list of floats
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return None
