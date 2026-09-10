"""WebSocket admission and session lifecycle contracts."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase

from config.jwt_auth.shortcuts import get_token
from config.websocket.consumers.thread_updates import ThreadUpdatesConsumer
from config.websocket.middleware import WS_AUTH_SUBPROTOCOL, JWTAuthMiddleware
from opencontractserver.conversations.models import (
    Conversation,
    ConversationTypeChoices,
)
from opencontractserver.corpuses.models import Corpus

User = get_user_model()


class WebSocketSessionContractTests(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="audit_ws_owner", password="audit"
        )
        self.viewer = User.objects.create_user(
            username="audit_ws_viewer", password="audit"
        )
        self.corpus = Corpus.objects.create(
            title="Audit ws corpus", creator=self.owner, is_public=True
        )

    def conversation(self, kind):
        return Conversation.objects.create(
            creator=self.owner,
            chat_with_corpus=self.corpus,
            conversation_type=kind,
            is_public=False,
        )

    def test_socket_uses_conversation_visibility(self):
        conversation = self.conversation(ConversationTypeChoices.CHAT)
        self.assertFalse(
            Conversation.objects.visible_to_user(self.viewer)
            .filter(pk=conversation.pk)
            .exists()
        )
        consumer = ThreadUpdatesConsumer()
        consumer.conversation_id = conversation.pk
        allowed = async_to_sync(consumer._check_conversation_access)(
            self.viewer, cache_conversation=False
        )
        self.assertFalse(
            allowed, "Corpus READ improperly grants access to a private CHAT socket"
        )

    def test_administrator_uses_conversation_visibility(self):
        self.corpus.is_public = False
        self.corpus.save(update_fields=["is_public"])
        conversation = self.conversation(ConversationTypeChoices.THREAD)
        self.viewer.is_superuser = True
        self.viewer.save(update_fields=["is_superuser"])
        self.assertFalse(
            Conversation.objects.visible_to_user(self.viewer)
            .filter(pk=conversation.pk)
            .exists()
        )
        consumer = ThreadUpdatesConsumer()
        consumer.conversation_id = conversation.pk
        allowed = async_to_sync(consumer._check_conversation_access)(
            self.viewer, cache_conversation=False
        )
        self.assertFalse(
            allowed,
            "Socket retained blanket admin access removed from canonical policy",
        )

    async def connect_socket(self, conversation, token):
        communicator = WebsocketCommunicator(
            JWTAuthMiddleware(ThreadUpdatesConsumer.as_asgi()),
            f"/ws/thread-updates/?conversation_id={conversation.pk}",
            subprotocols=[WS_AUTH_SUBPROTOCOL, token],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_json_from()
        await communicator.receive_json_from()
        return communicator

    def test_broadcast_rechecks_resource_access(self):
        conversation = self.conversation(ConversationTypeChoices.THREAD)
        token = get_token(self.viewer)

        async def scenario():
            from config.websocket.consumers.thread_updates import (
                get_thread_channel_group,
            )

            communicator = await self.connect_socket(conversation, token)
            try:
                await database_sync_to_async(
                    Corpus.objects.filter(pk=self.corpus.pk).update
                )(is_public=False)
                visible = await database_sync_to_async(
                    Conversation.objects.visible_to_user(self.viewer)
                    .filter(pk=conversation.pk)
                    .exists
                )()
                self.assertFalse(visible)
                await get_channel_layer().group_send(
                    get_thread_channel_group(conversation.pk),
                    {
                        "type": "agent_stream_complete",
                        "content": "AUDIT_SECRET_AFTER_REVOCATION",
                    },
                )
                event = await communicator.receive_output(timeout=2)
                self.assertNotIn(
                    "AUDIT_SECRET_AFTER_REVOCATION",
                    str(event),
                    "Socket streamed newly private content without an AUTH frame",
                )
            finally:
                await communicator.disconnect()

        async_to_sync(scenario)()

    def test_broadcast_rechecks_session_expiration(self):
        conversation = self.conversation(ConversationTypeChoices.THREAD)
        token = get_token(
            self.viewer, exp=int(datetime.now(timezone.utc).timestamp()) + 30
        )

        async def scenario():
            from config.websocket.consumers.thread_updates import (
                get_thread_channel_group,
            )

            communicator = await self.connect_socket(conversation, token)
            try:
                future = datetime.now(timezone.utc) + timedelta(minutes=2)
                with patch("jwt.api_jwt.datetime") as clock:
                    clock.now.return_value = future
                    await get_channel_layer().group_send(
                        get_thread_channel_group(conversation.pk),
                        {
                            "type": "agent_stream_complete",
                            "content": "AUDIT_SECRET_AFTER_EXPIRY",
                        },
                    )
                    event = await communicator.receive_output(timeout=2)
                self.assertNotIn(
                    "AUDIT_SECRET_AFTER_EXPIRY",
                    str(event),
                    "Socket streamed content after its JWT expired",
                )
            finally:
                await communicator.disconnect()

        async_to_sync(scenario)()

    def test_idle_socket_expires_without_client_frames(self):
        conversation = self.conversation(ConversationTypeChoices.THREAD)
        token = get_token(
            self.viewer, exp=int(datetime.now(timezone.utc).timestamp()) + 3
        )

        async def scenario():
            communicator = await self.connect_socket(conversation, token)
            try:
                failure = await communicator.receive_json_from(timeout=4)
                self.assertEqual(failure, {"type": "AUTH_FAILED", "reason": "EXPIRED"})
                close = await communicator.receive_output(timeout=1)
                self.assertEqual(close["type"], "websocket.close")
                self.assertEqual(close["code"], 4001)
            finally:
                await communicator.disconnect()

        async_to_sync(scenario)()

    def test_idle_socket_detects_disabled_user(self):
        conversation = self.conversation(ConversationTypeChoices.THREAD)
        token = get_token(self.viewer)

        async def scenario():
            with patch(
                "config.websocket.auth_handshake._AUTH_RECHECK_INTERVAL_SEC", 0.05
            ):
                communicator = await self.connect_socket(conversation, token)
                try:
                    await database_sync_to_async(
                        User.objects.filter(pk=self.viewer.pk).update
                    )(is_active=False)
                    failure = await communicator.receive_json_from(timeout=2)
                    self.assertEqual(failure["type"], "AUTH_FAILED")
                    close = await communicator.receive_output(timeout=1)
                    self.assertEqual(close["type"], "websocket.close")
                finally:
                    await communicator.disconnect()

        async_to_sync(scenario)()

    def test_successful_refresh_replaces_expiration_deadline(self):
        from config.websocket.consumers.thread_updates import get_thread_channel_group

        conversation = self.conversation(ConversationTypeChoices.THREAD)
        now = int(datetime.now(timezone.utc).timestamp())
        token = get_token(self.viewer, exp=now + 30)
        refreshed_token = get_token(self.viewer, exp=now + 300)

        async def scenario():
            communicator = await self.connect_socket(conversation, token)
            try:
                await communicator.send_json_to(
                    {"type": "AUTH", "token": refreshed_token}
                )
                ack = await communicator.receive_json_from()
                self.assertEqual(ack["type"], "AUTH_OK")
                self.assertTrue(ack["refreshed"])
                with patch("jwt.api_jwt.datetime") as clock:
                    clock.now.return_value = datetime.now(timezone.utc) + timedelta(
                        minutes=2
                    )
                    await get_channel_layer().group_send(
                        get_thread_channel_group(conversation.pk),
                        {
                            "type": "agent_stream_complete",
                            "content": "STILL_AUTHORIZED",
                        },
                    )
                    result = await communicator.receive_json_from(timeout=2)
                self.assertEqual(result["content"], "STILL_AUTHORIZED")
            finally:
                await communicator.disconnect()

        async_to_sync(scenario)()
