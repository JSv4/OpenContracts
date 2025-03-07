"""
Tests for the DocumentQueryConsumer WebSocket, verifying that a real network request
is made (captured by VCR.py) rather than mocked out. Follows the test style of
test_websocket_auth.py but exercises the actual agent code.
"""

import json
import logging
from typing import Any
from urllib.parse import quote

import vcr
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test.utils import override_settings
from graphql_relay import to_global_id

from opencontractserver.tests.base import WebsocketFixtureBaseTestCase

User = get_user_model()

logger = logging.getLogger(__name__)


@override_settings(USE_AUTH0=False)
class DocumentQueryConsumerTestCase(WebsocketFixtureBaseTestCase):
    """
    Tests for the DocumentQueryConsumer WebSocket, verifying that a real network request
    is made (captured by VCR.py) rather than mocked out, using fixture data.
    """

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/document_query_consumer/test_valid_token.yaml",
        filter_headers=["authorization"],
    )
    async def test_document_query_consumer_with_valid_token(self) -> None:
        """
        Verifies that providing a valid token allows a user to connect to the
        DocumentQueryConsumer, send a query, and receive a streaming or synchronous response.
        Network traffic is captured by VCR.py, so no mocking is used here.
        """
        # Ensure we have at least one Document from the fixtures
        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        valid_graphql_doc_id = to_global_id("DocumentType", self.doc.id)
        valid_graphql_doc_id = quote(valid_graphql_doc_id)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{valid_graphql_doc_id}/query/?token={self.token}",
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
            text_data=json.dumps({"query": "Please summarize the doc."})
        )

        # Gather messages until we encounter "ASYNC_FINISH" or "SYNC_CONTENT"
        messages: list[dict[str, Any]] = []
        while True:
            try:
                raw_message = await communicator.receive_from(timeout=10)
                print(
                    f"raw_message - test_document_query_consumer_with_valid_token: {raw_message}"
                )
                msg_json = json.loads(raw_message)
                messages.append(msg_json)
                if msg_json.get("type") in ("ASYNC_FINISH", "SYNC_CONTENT"):
                    break
            except Exception:
                break

        logger.info(f"Received {len(messages)} messages from DocumentQueryConsumer...")
        self.assertTrue(
            len(messages) > 0,
            "Should receive messages from the LLM query (per VCR cassette).",
        )

        await communicator.disconnect()

    async def test_document_query_consumer_with_invalid_token(self) -> None:
        """
        Verifies that providing an invalid token will lead to the connection being closed
        with code 4000, matching the behavior in the JWT auth middleware.
        """
        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{self.doc.id}/query/?token=not_a_real_token",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with invalid token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 for an invalid token.",
        )

    async def test_document_query_consumer_without_token(self) -> None:
        """
        Verifies that providing no token will also lead to connection close (4000).
        """
        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{self.doc.id}/query/",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with no token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 if token is missing.",
        )

    async def test_document_query_consumer_with_invalid_document(self) -> None:
        """
        Verifies that providing an invalid (non-existent) document ID triggers a bounce (4000).
        """
        # Use a large ID that doesn't exist in the fixture
        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/999999/query/?token={self.token}",
        )

        connected, close_code = await communicator.connect()
        print(f"Connection result: {connected}, {close_code}")

        raw_message = await communicator.receive_from(timeout=10)
        print(f"raw_message: {raw_message}")
        msg_json = json.loads(raw_message)

        self.assertTrue(
            msg_json.get("data", {}).get("error", None), "Requested Document not found."
        )
        await communicator.disconnect()
