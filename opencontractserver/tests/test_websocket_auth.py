"""
Tests for GraphQLJWTTokenAuthMiddleware to ensure that it correctly validates the received token
and assigns the correct user (or AnonymousUser) to the WebSocket scope.
"""
import json
import logging
from typing import Any
from unittest import mock
from unittest.mock import MagicMock
from urllib.parse import quote

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from graphql_relay import to_global_id

from opencontractserver.tests.base import WebsocketFixtureBaseTestCase

User = get_user_model()

logger = logging.getLogger(__name__)


class GraphQLJWTTokenAuthMiddlewareTestCase(WebsocketFixtureBaseTestCase):
    """
    Test class illustrating how GraphQLJWTTokenAuthMiddleware is tested in a WebSocket context.
    Uses the WebsocketFixtureBaseTestCase to provide test data and token handling.
    """

    @mock.patch(
        "opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent",
        new_callable=mock.AsyncMock,
    )
    async def test_middleware_with_valid_token(
        self,
        mock_create_document_agent: mock.AsyncMock,
    ) -> None:
        """
        Verifies that providing a valid token results in successful connection
        and a logged-in user on the scope. Mocks the create_document_agent factory
        to avoid spinning up real LLM resources.
        """
        # We return a MagicMock (our 'agent') when create_document_agent is awaited
        mock_create_document_agent.return_value = MagicMock()

        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        valid_graphql_doc_id = to_global_id("DocumentType", self.doc.id)
        valid_graphql_doc_id = quote(valid_graphql_doc_id)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{valid_graphql_doc_id}/query/?token={self.token}",
        )

        connected, _ = await communicator.connect()
        self.assertTrue(
            connected,
            "WebSocket should connect successfully with a valid token.",
        )

        # Confirm that the scope user is authenticated
        scope_user = communicator.scope["user"]
        self.assertTrue(scope_user.is_authenticated, "User must be authenticated.")
        self.assertEqual(scope_user.username, self.user.username)

        # Send a test query to verify the connection works
        await communicator.send_to(json.dumps({"query": "Please summarize the doc."}))

        # Gather messages until we encounter "ASYNC_FINISH" or "SYNC_CONTENT"
        messages: list[dict[str, Any]] = []
        while True:
            try:
                raw_message = await communicator.receive_from(timeout=10)
                logger.debug(
                    f"raw_message - test_middleware_with_valid_token: {raw_message}"
                )
                msg_json = json.loads(raw_message)
                messages.append(msg_json)
                if msg_json.get("type") in ("ASYNC_FINISH", "SYNC_CONTENT"):
                    break
            except Exception:
                break

        self.assertTrue(
            len(messages) > 0, "Should receive messages from the LLM query."
        )

        await communicator.disconnect()

    @mock.patch(
        "opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent",
        new_callable=mock.AsyncMock,
    )
    async def test_middleware_with_invalid_token(
        self,
        mock_create_document_agent: mock.AsyncMock,
    ) -> None:
        """
        Verifies that providing an invalid token will lead to the connection being closed
        with code 4000, matching the behavior in the JWT auth middleware.
        Mocking create_document_agent to ensure no real LLM resources are used.
        """
        # Even though invalid, we'll define a MagicMock to satisfy the async patch
        mock_create_document_agent.return_value = MagicMock()

        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        valid_graphql_doc_id = to_global_id("DocumentType", self.doc.id)
        valid_graphql_doc_id = quote(valid_graphql_doc_id)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{valid_graphql_doc_id}/query/?token=not_a_real_token",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with invalid token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 for an invalid token.",
        )

    @mock.patch(
        "opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent",
        new_callable=mock.AsyncMock,
    )
    async def test_middleware_without_token(
        self,
        mock_create_document_agent: mock.AsyncMock,
    ) -> None:
        """
        Verifies that providing no token will also lead to connection close (4000).
        Mocking create_document_agent to ensure no real LLM resources are used.
        """
        # Even though no token is provided, we still define our mock
        mock_create_document_agent.return_value = MagicMock()

        self.assertTrue(hasattr(self, "doc"), "A fixture Document must be available.")

        valid_graphql_doc_id = to_global_id("DocumentType", self.doc.id)
        valid_graphql_doc_id = quote(valid_graphql_doc_id)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{valid_graphql_doc_id}/query/",  # No token param
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected, "Connection should fail with no token.")
        self.assertEqual(
            close_code,
            4000,
            "WebSocket should reject the connection with code 4000 if token is missing.",
        )
