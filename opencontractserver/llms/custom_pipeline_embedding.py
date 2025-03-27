from typing import List, Optional, Union
import asyncio
import logging

from llama_index.core.base.embeddings.base import (
    BaseEmbedding,
    Embedding,
)
from llama_index.core.callbacks import CallbackManager
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.utils.embeddings import generate_embeddings_from_text

logger = logging.getLogger(__name__)

class OpenContractsPipelineEmbedding(BaseEmbedding):
    """
    A llama_index-compatible embedding class that wraps the OpenContracts pipeline function
    ``generate_embeddings_from_text``. This class can be used as the active embedding model
    wherever llama_index expects a ``BaseEmbedding`` object.

    Args:
        corpus_id: Optional integer specifying the corpus in which the embeddings should be generated.
        mimetype: Optional string or enum specifying the file mimetype/context.
        embedder_path: Optional string specifying a custom path to an embedding model.
        embed_batch_size: Batch size for embeddings (inherited from ``BaseEmbedding``).
        callback_manager: llama_index callback manager (inherited from ``BaseEmbedding``).

    Example:
    ```python
    from opencontractserver.llms.custom_pipeline_embedding import OpenContractsPipelineEmbedding
    from llama_index.core import Settings

    # Create an instance of our custom embedding class
    custom_embedder = OpenContractsPipelineEmbedding(
        corpus_id=123, 
        mimetype="application/pdf", 
        embedder_path="/models/my_custom_embedder"
    )

    # Tell llama_index to use this embedder
    Settings.embed_model = custom_embedder

    # Now whenever llama_index calls get_text_embedding or get_query_embedding,
    # it will invoke generate_embeddings_from_text under the hood.
    ```
    """

    corpus_id: Optional[int] = None
    mimetype: Optional[Union[str, FileTypeEnum]] = None
    embedder_path: Optional[str] = None
    embed_batch_size: int = 32
    callback_manager: Optional[CallbackManager] = None

    def __init__(
        self,
        corpus_id: Optional[int] = None,
        mimetype: Optional[Union[str, FileTypeEnum]] = None,
        embedder_path: Optional[str] = None,
        embed_batch_size: int = 32,
        callback_manager: Optional[CallbackManager] = None,
    ):
        """
        Initialize with optional corpus_id, mimetype, and embedder_path. These will be passed 
        to the underlying OpenContracts pipeline function that generates embeddings.

        :param corpus_id: An optional corpus ID for scoping embeddings.
        :param mimetype: An optional string or enum specifying the file type.
        :param embedder_path: An optional path to a custom embedding model.
        :param embed_batch_size: The batch size for embedding calls.
        :param callback_manager: A llama_index CallbackManager.
        """
        super().__init__(
            model_name="opencontracts-pipeline-model",
            embed_batch_size=embed_batch_size,
            callback_manager=callback_manager,
        )
        self.corpus_id = corpus_id
        self.mimetype = mimetype
        self.embedder_path = embedder_path

    def _get_query_embedding(self, query: str) -> Embedding:
        """
        Embed the input query text synchronously, by calling OpenContracts' 
        ``generate_embeddings_from_text`` function.

        :param query: A string representing the query text.
        :return: A list of floats representing the generated embedding.
        """
        # Call our custom pipeline function to get embeddings as list of floats
        logger.debug(f"Generating embeddings for query: {query}")
        embedding: List[float] = generate_embeddings_from_text(
            text=query,
            corpus_id=self.corpus_id,
            mimetype=self.mimetype,
            embedder_path=self.embedder_path,
        )
        return embedding

    async def _aget_query_embedding(self, query: str) -> Embedding:
        """
        Asynchronously embed the input query text, by calling OpenContracts' 
        ``generate_embeddings_from_text`` function in a background thread.

        :param query: A string representing the query text.
        :return: A list of floats representing the generated embedding.
        """
        return await asyncio.to_thread(self._get_query_embedding, query)

    def _get_text_embedding(self, text: str) -> Embedding:
        """
        Embed the input text synchronously, by calling OpenContracts' 
        ``generate_embeddings_from_text`` function.

        :param text: A string representing the text content.
        :return: A list of floats representing the generated embedding.
        """
        logger.debug(f"Generating embeddings for text: {text[:50]}...")
        embedding: List[float] = generate_embeddings_from_text(
            text=text,
            corpus_id=self.corpus_id,
            mimetype=self.mimetype,
            embedder_path=self.embedder_path,
        )
        return embedding

    async def _aget_text_embedding(self, text: str) -> Embedding:
        """
        Asynchronously embed the input text, by calling OpenContracts' 
        ``generate_embeddings_from_text`` function in a background thread.

        :param text: A string representing text content.
        :return: A list of floats representing the generated embedding.
        """
        return await asyncio.to_thread(self._get_text_embedding, text)