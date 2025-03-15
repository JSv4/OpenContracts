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
        FileTypeEnum.HTML,
    ]

    def __init__(self):
        """Initialize the ModernBERT embedder."""
        self.model = None
        self.model_name = "answerdotai/ModernBERT-base"
        self.cache_dir = "/models"
        self.model_path = os.path.join(
            self.cache_dir, "sentence-transformers", "ModernBERT-base"
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

    def embed_text(self, text: str, **kwargs) -> Optional[list[float]]:
        """
        Generate embeddings for the given text using the ModernBERT model.

        Args:
            text: The text to embed
            **kwargs: Additional arguments to pass to the model

        Returns:
            A list of floats representing the embedding vector, or None if an error occurs
        """
        try:
            # Load the model if not already loaded
            self._load_model()

            # Handle empty text
            if not text or not text.strip():
                logger.warning("Empty text provided for embedding")
                return [0.0] * self.vector_size

            # Generate embeddings
            embedding = self.model.encode(text, **kwargs)

            # Convert to list of floats
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return None


# Create specialized versions with different model variants if needed
class ModernBERTEmbedder768(ModernBERTEmbedder):
    """
    ModernBERT embedder that generates 768-dimensional vectors.
    This is the default size for the ModernBERT model.
    """

    title = "ModernBERT Embedder (768d)"
    description = "Generates 768-dimensional embeddings using the ModernBERT model."
    vector_size = 768
