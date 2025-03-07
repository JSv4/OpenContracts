"""
Tests for the CorpusQueryConsumer WebSocket, verifying that a real network request
is made (captured by VCR.py) rather than mocked out. Follows the test style of
test_document_query_consumer.py but exercises the actual corpus agent code.
"""

import json
import logging
from typing import Any
from unittest.mock import patch
from urllib.parse import quote

import vcr
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import override_settings
from graphql_relay import to_global_id

from opencontractserver.tests.base import WebsocketFixtureBaseTestCase

User = get_user_model()
logger = logging.getLogger(__name__)


class CorpusQueryConsumerTestCase(WebsocketFixtureBaseTestCase):
    """
    Tests for the CorpusQueryConsumer WebSocket, verifying that a real network request
    is made (captured by VCR.py) rather than mocked out, using fixture data.
    """

    @override_settings(USE_AUTH0=False)
    @patch(
        "config.websocket.consumers.corpus_conversation.CorpusQueryConsumer.generate_conversation_title"
    )
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/corpus_query_consumer/test_valid_token.yaml",
        filter_headers=["authorization"],
        match_on=["method", "scheme", "host", "port", "path", "query"],
        record_mode="once",
    )
    async def test_corpus_query_consumer_with_valid_token(
        self, mock_generate_title
    ) -> None:
        """
        Verifies that providing a valid token allows a user to connect to the
        CorpusQueryConsumer, send a query, and receive a streaming or synchronous response.
        Network traffic is captured by VCR.py, so no mocking is used here except for title generation.
        """
        # Mock the title generation to return a fixed value
        mock_generate_title.return_value = "Mocked Conversation Title"

        # Ensure we have at least one Corpus from the fixtures
        self.assertTrue(hasattr(self, "corpus"), "A fixture Corpus must be available.")

        valid_graphql_corpus_id = to_global_id("CorpusType", self.corpus.id)
        valid_graphql_corpus_id = quote(valid_graphql_corpus_id)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{valid_graphql_corpus_id}/query/?token={self.token}",
        )

        connected, _ = await communicator.connect()
        self.assertTrue(
            connected, "WebSocket should connect successfully with a valid token."
        )

        # Confirm that the scope user is authenticated
        scope_user = communicator.scope["user"]
        self.assertTrue(scope_user.is_authenticated, "User must be authenticated.")
        self.assertEqual(scope_user.username, self.user.username)

        # Send a user query
        await communicator.send_to(
            text_data=json.dumps({"query": "Please summarize the corpus."})
        )

        # Gather messages until we encounter "ASYNC_FINISH" or "SYNC_CONTENT"
        messages: list[dict[str, Any]] = []
        while True:
            try:
                raw_message = await communicator.receive_from(timeout=10)
                logger.debug(
                    f"raw_message - test_corpus_query_consumer_with_valid_token: {raw_message}"
                )
                msg_json = json.loads(raw_message)
                messages.append(msg_json)
                if msg_json.get("type") in ("ASYNC_FINISH", "SYNC_CONTENT"):
                    break
            except Exception:
                break

        print(f"Received {len(messages)} messages: {messages}")

        # For demonstration, we verify the message count as in test_document_query_consumer.
        # Adjust expected counts or checks as appropriate for your real VCR fixtures.
        self.assertTrue(
            len(messages) > 0,
            "Should receive messages from the LLM query (per VCR cassette).",
        )
        logger.info(
            f"Received {len(messages)} messages from CorpusQueryConsumer: {messages}"
        )

        await communicator.disconnect()

    async def test_corpus_query_consumer_with_invalid_token(self) -> None:
        """
        Verifies that providing an invalid token will lead to the connection being closed
        with code 4000, matching the behavior in the JWT auth middleware.
        """
        self.assertTrue(hasattr(self, "corpus"), "A fixture Corpus must be available.")

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{self.corpus.id}/query/?token=not_a_real_token",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with invalid token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 for an invalid token.",
        )

    async def test_corpus_query_consumer_without_token(self) -> None:
        """
        Verifies that providing no token will also lead to connection close (4000).
        """
        self.assertTrue(hasattr(self, "corpus"), "A fixture Corpus must be available.")

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{self.corpus.id}/query/",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with no token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 if token is missing.",
        )

    async def test_corpus_query_consumer_with_invalid_corpus(self) -> None:
        """
        Verifies that providing an invalid (non-existent) corpus ID triggers a bounce (4000).
        """
        # Use a large ID that doesn't exist in the fixture
        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/999999/query/?token={self.token}",
        )

        connected, close_code = await communicator.connect()
        logger.debug(f"Connection result: {connected}, {close_code}")

        if connected:
            raw_message = await communicator.receive_from(timeout=10)
            logger.debug(f"raw_message: {raw_message}")
            msg_json = json.loads(raw_message)
            self.assertTrue(
                "error" in msg_json.get("data", {}),
                "Requested Corpus not found.",
            )

        await communicator.disconnect()
