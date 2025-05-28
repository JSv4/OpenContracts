from __future__ import annotations

"""
Integration-level websocket test for the refactored CorpusQueryConsumer.

The pattern mirrors `test_document_conversation_lllama_index_ws.py`: we open a
real Channels WebSocket (no mocks for the consumer itself), rely on VCR.py to
replay any outbound HTTP requests from the LLM layer, and assert that the
consumer still produces the four message-types (`ASYNC_START`,
`ASYNC_CONTENT`, `ASYNC_FINISH`, `SYNC_CONTENT`) the UI depends on.
"""

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
    End-to-end websocket test for the refactored CorpusQueryConsumer.
    """

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_corpus_conversation_ws.yaml",
        filter_headers=["authorization"],
    )
    async def test_streaming_flow(self) -> None:
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
                raw = await communicator.receive_from(timeout=15)
            except Exception:  # noqa: BLE001
                self.fail("Timed-out waiting for websocket messages")

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
        full_text = "".join(m["content"] for m in received if m["type"] == "ASYNC_CONTENT")
        self.assertTrue(
            full_text.strip(),
            "Reconstructed assistant message should not be empty.",
        )

        # ------------------------------------------------------------------
        # 5.  Cleanup
        # ------------------------------------------------------------------
        await communicator.disconnect()