from __future__ import annotations

"""
Integration-level websocket test for the refactored CorpusQueryConsumer.

The pattern mirrors `test_document_conversation_lllama_index_ws.py`: we open a
real Channels WebSocket (no mocks for the consumer itself), rely on VCR.py to
replay any outbound HTTP requests from the LLM layer, and assert that the
consumer still produces the four message-types (`ASYNC_START`,
`ASYNC_CONTENT`, `ASYNC_FINISH`, `SYNC_CONTENT`) the UI depends on.
"""

import datetime
import json
import logging
from typing import Any
from urllib.parse import quote

import vcr
from channels.testing import WebsocketCommunicator
from django.test.utils import override_settings
from graphql_relay import to_global_id

from opencontractserver.tests.base import WebsocketFixtureBaseTestCase

logger = logging.getLogger(__name__)


@override_settings(USE_AUTH0=False)
class CorpusConversationWebsocketTestCase(WebsocketFixtureBaseTestCase):
    """
    End-to-end websocket test for the refactored ``CorpusQueryConsumer``.

    The same assertions are executed twice – once with
    ``LLMS_*_AGENT_FRAMEWORK = "llama_index"`` and again with
    ``"pydantic_ai"`` – ensuring our new *settings-based* default selection
    logic works for both frameworks.
    """

    # ------------------------------------------------------------------
    # Helper that performs the actual websocket round-trip assertions.
    # ------------------------------------------------------------------
    async def _assert_streaming_flow(self) -> None:
        """
        Connect, send a query, and verify the ASYNC_START → ASYNC_CONTENT →
        ASYNC_FINISH message sequence with consistent ``message_id``.
        """

        # ------------------------------------------------------------------
        # 1.  Build websocket path that targets the corpus consumer
        # ------------------------------------------------------------------
        corpus_gid = to_global_id("CorpusType", self.corpus.id)
        encoded_corpus_gid = quote(corpus_gid)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{encoded_corpus_gid}/query/?token={self.token}",
        )

        connected, _ = await communicator.connect()
        self.assertTrue(connected, "WebSocket should establish successfully.")

        # ------------------------------------------------------------------
        # 2.  Send a user query
        # ------------------------------------------------------------------
        await communicator.send_to(json.dumps({"query": "Give me a summary."}))

        # ------------------------------------------------------------------
        # 3.  Collect messages until ASYNC_FINISH
        # ------------------------------------------------------------------
        received: list[dict[str, Any]] = []
        while True:
            try:
                start = datetime.datetime.now()
                raw = await communicator.receive_from(timeout=50)
                end = datetime.datetime.now()
                logger.info(f"time taken: {end - start}")
            except Exception as e:  # noqa: BLE001
                import traceback

                traceback.print_exc()
                logger.error(f"Websocket timeout error: {e}", exc_info=True)
                self.fail(f"Timed-out waiting for websocket messages: {e}")

            payload = json.loads(raw)
            logger.debug("payload=%s", payload)
            received.append(payload)

            if payload.get("type") == "ASYNC_FINISH":
                break

        # ------------------------------------------------------------------
        # 4.  Assertions
        # ------------------------------------------------------------------
        self.assertGreaterEqual(
            len(received),
            3,  # start + ≥1 content + finish
            "Consumer should emit at least START, one CONTENT, and FINISH.",
        )

        # Chronological order of message types
        self.assertEqual(received[0]["type"], "ASYNC_START")
        self.assertEqual(received[-1]["type"], "ASYNC_FINISH")
        self.assertTrue(
            any(m["type"] == "ASYNC_CONTENT" for m in received),
            "At least one ASYNC_CONTENT message expected.",
        )

        # Consistent message_id across the stream
        start_msg_id = received[0]["data"]["message_id"]
        self.assertTrue(start_msg_id, "START message must include message_id.")

        for msg in received[1:]:
            if "data" in msg and "message_id" in msg["data"]:
                self.assertEqual(
                    msg["data"]["message_id"],
                    start_msg_id,
                    "message_id must remain constant for the full assistant message.",
                )

        # Full assistant text reconstructed from content chunks is non-empty
        full_text = "".join(
            m["content"] for m in received if m["type"] == "ASYNC_CONTENT"
        )
        self.assertTrue(
            full_text.strip(),
            "Reconstructed assistant message should not be empty.",
        )

        # ------------------------------------------------------------------
        # 5.  Cleanup
        # ------------------------------------------------------------------
        await communicator.disconnect()

    # ------------------------------------------------------------------
    # Negative-path helpers
    # ------------------------------------------------------------------
    async def _assert_invalid_token(self) -> None:
        """Connection should be rejected (code 4000) when the JWT is invalid."""
        corpus_gid = to_global_id("CorpusType", self.corpus.id)
        encoded_corpus_gid = quote(corpus_gid)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{encoded_corpus_gid}/query/?token=not_a_real_token",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4000)

    async def _assert_missing_token(self) -> None:
        """Omitting the token entirely must also yield close 4000."""
        corpus_gid = to_global_id("CorpusType", self.corpus.id)
        encoded_corpus_gid = quote(corpus_gid)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{encoded_corpus_gid}/query/",
        )
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4000)

    async def _assert_invalid_corpus(self) -> None:
        """
        A non-existent corpus ID should result in:
        • WebSocket *accepted*
        • Immediate `SYNC_CONTENT` error payload
        • Close code 4000
        """
        bad_corpus_gid = to_global_id("CorpusType", 999_999)
        encoded_bad_gid = quote(bad_corpus_gid)

        communicator = WebsocketCommunicator(
            self.application,
            f"ws/corpus/{encoded_bad_gid}/query/?token={self.token}",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        raw = await communicator.receive_from(timeout=50)
        payload = json.loads(raw)
        self.assertEqual(payload["type"], "SYNC_CONTENT")
        self.assertIn("error", payload["data"])
        self.assertEqual(payload["data"]["error"], "Requested corpus not found.")

        # The consumer should now close the websocket with code 4000.
        close_event = await communicator.receive_output(timeout=50)
        self.assertEqual(close_event["type"], "websocket.close")
        self.assertEqual(close_event["code"], 4000)

        # Ensure the communicator is fully shut down
        await communicator.wait()

    # ------------------------------------------------------------------
    # Public test method – loops over the two default frameworks and
    # re-executes the helper under a fresh ``override_settings`` context.
    # ------------------------------------------------------------------
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_corpus_conversation_ws.yaml",
        filter_headers=["authorization"],
    )
    async def test_streaming_flow__all_default_frameworks(self) -> None:
        """
        Execute the streaming-flow test twice – once for each framework
        that can be selected globally through the LLMS settings.
        """

        for framework in ("llama_index", "pydantic_ai"):
            with self.subTest(default_framework=framework):
                # Dynamically override the global defaults for this sub-test
                with override_settings(
                    LLMS_DEFAULT_AGENT_FRAMEWORK=framework,
                    LLMS_DOCUMENT_AGENT_FRAMEWORK=framework,
                    LLMS_CORPUS_AGENT_FRAMEWORK=framework,
                ):
                    logger.info("Testing corpus agent framework: %s", framework)
                    await self._assert_streaming_flow()
                    logger.info(
                        "PASS - Successfully tested corpus agent framework: %s",
                        framework,
                    )

    # ------------------------------------------------------------------
    # Negative-path public tests (framework-agnostic)
    # ------------------------------------------------------------------
    async def test_invalid_token(self) -> None:  # noqa: D401
        """Connection rejected with an **invalid** JWT token."""
        await self._assert_invalid_token()

    async def test_missing_token(self) -> None:  # noqa: D401
        """Connection rejected when **no** JWT token is supplied."""
        await self._assert_missing_token()

    async def test_invalid_corpus_id(self) -> None:  # noqa: D401
        """Proper SYNC_CONTENT error for a non-existent corpus ID."""
        await self._assert_invalid_corpus()
