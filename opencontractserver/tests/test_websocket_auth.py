"""
Tests for GraphQLJWTTokenAuthMiddleware to ensure that it correctly validates the received token
and assigns the correct user (or AnonymousUser) to the WebSocket scope.
"""
import logging
from unittest import mock
from unittest.mock import MagicMock

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.db import transaction
from config.asgi import application
from graphql_jwt.shortcuts import get_token

from opencontractserver.documents.models import Document

User = get_user_model()

logger = logging.getLogger(__name__)


class GraphQLJWTTokenAuthMiddlewareTestCase(TestCase):
    """
    Test class illustrating how GraphQLJWTTokenAuthMiddleware is tested in a WebSocket context.
    """

    @classmethod
    def setUpTestData(cls) -> None:
        """
        Create test data in a synchronous context before running async tests.
        This is Django's recommended way to set up test data for the entire TestCase.
        """
        # Create test user
        with transaction.atomic():
            cls.user = User.objects.create_user(
                username="bob",
                password="12345678",
                is_usage_capped=False,
            )

        # Create test API Token
        with transaction.atomic():
            cls.token = get_token(user=cls.user)

        # Create test document
        with transaction.atomic():
            cls.document = Document.objects.create(
                title="Test Document",
                description="Imported document with filename",
                backend_lock=True,
                creator=cls.user,
                page_count=5,
            )

    def setUp(self) -> None:
        """
        Set up the application for testing.
        """
        self.application = application

    @mock.patch("config.websocket.consumers.document_conversation.HuggingFaceEmbedding", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAIAgent", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAI", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.VectorStoreIndex", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.Settings", new=MagicMock())
    async def test_middleware_with_valid_token(self) -> None:
        """
        Verifies that providing a valid token results in successful connection
        and a logged-in user on the scope.
        """
        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{self.document.id}/query/?token={str(self.token)}",
        )

        connected, _ = await communicator.connect()
        self.assertTrue(
            connected,
            "WebSocket should connect with a valid token (mocked LlamaIndex)."
        )

        scope_user = communicator.scope["user"]
        self.assertEqual(
            scope_user.username,
            self.user.username,
            "Scope user should match the token user."
        )
        self.assertTrue(
            scope_user.is_authenticated,
            "Scope user should be authenticated for a valid token."
        )

        await communicator.disconnect()

    @mock.patch("config.websocket.consumers.document_conversation.HuggingFaceEmbedding", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAIAgent", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAI", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.VectorStoreIndex", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.Settings", new=MagicMock())
    async def test_middleware_with_invalid_token(self) -> None:
        """
        Verifies behavior when an invalid token is provided.
        Middleware should set the scope user to AnonymousUser.
        """
        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{self.document.id}/query/?token=invalid_token",
        )
        connected, code = await communicator.connect()

        logger.info(f"Connected: {connected}, b: {code}")

        self.assertFalse(
            connected,
            "WebSocket is connected but connection should bounce."
        )

        self.assertEqual(
            code,
            4000,
            "WebSocket should bounce with code 4000."
        )

    @mock.patch("config.websocket.consumers.document_conversation.HuggingFaceEmbedding", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAIAgent", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.OpenAI", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.VectorStoreIndex", new=MagicMock())
    @mock.patch("config.websocket.consumers.document_conversation.Settings", new=MagicMock())
    async def test_middleware_without_token(self) -> None:
        """
        Verifies behavior when no token is provided.
        Middleware should set scope user to AnonymousUser.
        """
        communicator = WebsocketCommunicator(
            self.application,
            f"ws/document/{self.document.id}/query/",  # No token param
        )
        connected, code = await communicator.connect()

        logger.info(f"test_middleware_without_token - Connected: {connected}, b: {code}")

        self.assertFalse(
            connected,
            "WebSocket is connected but connection should bounce."
        )

        self.assertEqual(
            code,
            4000,
            "WebSocket should bounce with code 4000."
        )

        