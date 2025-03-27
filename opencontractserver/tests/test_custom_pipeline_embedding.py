"""
Tests for the OpenContractsPipelineEmbedding class.
"""

import asyncio
from typing import Any, Callable
from unittest.mock import patch

from django.test import TestCase
from llama_index.core.callbacks import CallbackManager

from opencontractserver.llms.custom_pipeline_embedding import (
    OpenContractsPipelineEmbedding,
)


class TestOpenContractsPipelineEmbedding(TestCase):
    """
    TestCase for OpenContractsPipelineEmbedding functionality.
    """

    def setUp(self) -> None:
        """
        Set up common test resources before each test.
        """
        self.test_corpus_id = 42
        self.test_mimetype = "application/test"
        self.test_embedder_path = "/path/to/test/embedder"
        self.embedding_model = OpenContractsPipelineEmbedding(
            corpus_id=self.test_corpus_id,
            mimetype=self.test_mimetype,
            embedder_path=self.test_embedder_path,
            embed_batch_size=2,
            callback_manager=CallbackManager([]),
        )

    def get_async_task_result(
        self, async_func: Callable[..., Any], *args, **kwargs
    ) -> Any:
        """
        Helper method to run an async function synchronously in a test context.
        """
        return asyncio.run(async_func(*args, **kwargs))

    @patch(
        "opencontractserver.llms.custom_pipeline_embedding.generate_embeddings_from_text"
    )
    def test_get_query_embedding(self, mock_generate_embeddings):
        """
        Test the synchronous query embedding generation.
        """
        mock_generate_embeddings.return_value = [0.1, 0.2, 0.3]
        query_text = "Test query"
        result_embedding = self.embedding_model.get_query_embedding(query_text)

        # Assertions
        mock_generate_embeddings.assert_called_once_with(
            text=query_text,
            corpus_id=self.test_corpus_id,
            mimetype=self.test_mimetype,
            embedder_path=self.test_embedder_path,
        )
        self.assertIsInstance(result_embedding, list)
        self.assertListEqual(result_embedding, [0.1, 0.2, 0.3])

    @patch(
        "opencontractserver.llms.custom_pipeline_embedding.generate_embeddings_from_text"
    )
    def test_get_text_embedding(self, mock_generate_embeddings):
        """
        Test the synchronous text embedding generation.
        """
        mock_generate_embeddings.return_value = [0.5, 0.6, 0.7]
        text_content = "Embedding this text"
        result_embedding = self.embedding_model.get_text_embedding(text_content)

        # Assertions
        mock_generate_embeddings.assert_called_once_with(
            text=text_content,
            corpus_id=self.test_corpus_id,
            mimetype=self.test_mimetype,
            embedder_path=self.test_embedder_path,
        )
        self.assertIsInstance(result_embedding, list)
        self.assertListEqual(result_embedding, [0.5, 0.6, 0.7])

    @patch(
        "opencontractserver.llms.custom_pipeline_embedding.generate_embeddings_from_text"
    )
    def test_async_get_query_embedding(self, mock_generate_embeddings):
        """
        Test the async query embedding generation.
        """
        mock_generate_embeddings.return_value = [1.0, 1.1, 1.2]
        query_text = "Async query"

        result_embedding = self.get_async_task_result(
            self.embedding_model.aget_query_embedding, query_text
        )

        # Assertions
        mock_generate_embeddings.assert_called_once()
        self.assertIsInstance(result_embedding, list)
        self.assertListEqual(result_embedding, [1.0, 1.1, 1.2])

    @patch(
        "opencontractserver.llms.custom_pipeline_embedding.generate_embeddings_from_text"
    )
    def test_async_get_text_embedding(self, mock_generate_embeddings):
        """
        Test the async text embedding generation.
        """
        mock_generate_embeddings.return_value = [2.0, 2.1, 2.2]
        text_content = "Async text"

        result_embedding = self.get_async_task_result(
            self.embedding_model.aget_text_embedding, text_content
        )

        # Assertions
        mock_generate_embeddings.assert_called_once()
        self.assertIsInstance(result_embedding, list)
        self.assertListEqual(result_embedding, [2.0, 2.1, 2.2])

    def test_init_parameters(self):
        """
        Ensure the initialization parameters are set correctly.
        """
        self.assertEqual(self.embedding_model.corpus_id, self.test_corpus_id)
        self.assertEqual(self.embedding_model.mimetype, self.test_mimetype)
        self.assertEqual(self.embedding_model.embedder_path, self.test_embedder_path)
        self.assertEqual(self.embedding_model.embed_batch_size, 2)
        self.assertIsInstance(self.embedding_model.callback_manager, CallbackManager)

    def test_model_name(self):
        """
        Verify the model name is set as expected.
        """
        self.assertEqual(
            self.embedding_model.model_name, "opencontracts-pipeline-model"
        )
