from __future__ import annotations

"""
CorpusQueryConsumer

Channels WebSocket consumer that lets the frontend query a corpus via an
LLM-backed agent.  Uses the new unified LLM agent API (`opencontractserver.llms.agents`)
so the consumer is framework-agnostic (Llama-Index, Pydantic-AI, …).

The consumer keeps the websocket protocol identical to the old version, emitting
four message-types expected by the UI:

• ASYNC_START
• ASYNC_CONTENT
• ASYNC_FINISH
• SYNC_CONTENT
"""

import json
import logging
import urllib.parse
import uuid
from typing import Any

from channels.generic.websocket import AsyncWebsocketConsumer
from graphql_relay import from_global_id

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.conversations.models import MessageType
from opencontractserver.corpuses.models import Corpus
from opencontractserver.llms import agents

logger = logging.getLogger(__name__)


class CorpusQueryConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer that streams answers to corpus-level questions.

    The first request initialises an agent (lazy); subsequent requests reuse the
    same agent so that conversation context is preserved across websocket
    messages.
    """

    agent = None
    corpus: Corpus | None = None
    session_id: str | None = None

    # --------------------------------------------------------------------- #
    #  WebSocket lifecycle                                                  #
    # --------------------------------------------------------------------- #
    async def connect(self) -> None:
        """
        Authenticate the user, load the target corpus, then accept the socket.
        """
        self.session_id = str(uuid.uuid4())
        logger.debug(
            "[Session %s] connect() called.  Scope: %s",
            self.session_id,
            self.scope,
        )

        # ------------------------------------------------------------------ #
        #  Authentication                                                    #
        # ------------------------------------------------------------------ #
        if not self.scope["user"].is_authenticated:
            logger.warning("[Session %s] Unauthenticated user", self.session_id)
            await self.close(code=4000)
            return

        try:
            graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
            self.corpus_id = int(from_global_id(graphql_corpus_id)[1])
            self.corpus = await Corpus.objects.aget(id=self.corpus_id)
        except (ValueError, Corpus.DoesNotExist) as err:
            logger.error("[Session %s] Invalid corpus: %s", self.session_id, err)
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                data={"error": "Requested corpus not found."},
            )
            await self.close(code=4000)
            return

        await self.accept()
        logger.debug("[Session %s] WebSocket accepted.", self.session_id)

    async def disconnect(self, close_code: int) -> None:
        """Clean up on socket close."""
        logger.debug(
            "[Session %s] WebSocket disconnected.  Code=%s", self.session_id, close_code
        )
        self.agent = None  # allow GC

    # --------------------------------------------------------------------- #
    #  Public helpers                                                       #
    # --------------------------------------------------------------------- #
    async def send_standard_message(
        self,
        msg_type: MessageType,
        content: str = "",
        data: dict[str, Any] | None = None,
    ) -> None:
        """
        Send a JSON-encoded message with a fixed envelope understood by the UI.
        """
        await self.send(
            json.dumps(
                {
                    "type": msg_type,
                    "content": content,
                    "data": data or {},
                }
            )
        )

    # --------------------------------------------------------------------- #
    #  Main message handler                                                 #
    # --------------------------------------------------------------------- #
    async def receive(self, text_data: str) -> None:
        """
        Expected client payload::

            { "query": "some user question" }
        """
        logger.debug("[Session %s] <- %s", self.session_id, text_data)

        try:
            payload: dict[str, Any] = json.loads(text_data)
            user_query: str = payload.get("query", "").strip()
        except Exception:
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                data={"error": "Malformed JSON payload."},
            )
            return

        if not user_query:
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                data={"error": "No query provided."},
            )
            return

        # -------------------------------------------------------------- #
        #  Lazy agent creation                                           #
        # -------------------------------------------------------------- #
        if self.agent is None:
            logger.debug("[Session %s] Creating corpus agent…", self.session_id)

            # Optional conversation id passed via query-string
            conversation_id: int | None = None
            query_string = self.scope.get("query_string", b"").decode()
            qs_params = urllib.parse.parse_qs(query_string)
            convo_gid = qs_params.get("load_from_conversation_id", [None])[0]
            if convo_gid:
                try:
                    conversation_id = int(from_global_id(convo_gid)[1])
                    logger.debug(
                        "[Session %s] Resuming conversation %s",
                        self.session_id,
                        conversation_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.error(
                        "[Session %s] Failed to parse conversation id: %s",
                        self.session_id,
                        exc,
                    )

            agent_kwargs: dict[str, Any] = {
                "corpus": self.corpus_id,
                "user_id": self.scope["user"].id,
            }
            if conversation_id:
                agent_kwargs["conversation_id"] = conversation_id

            if getattr(self.corpus, "preferred_embedder", None):
                agent_kwargs["embedder_path"] = self.corpus.preferred_embedder

            self.agent = await agents.for_corpus(**agent_kwargs)
            logger.debug("[Session %s] Agent ready.", self.session_id)

        # -------------------------------------------------------------- #
        #  Stream the LLM response                                       #
        # -------------------------------------------------------------- #
        try:
            async for chunk in self.agent.stream(user_query):
                # First chunk: announce the LLM message_id
                if chunk.user_message_id and not hasattr(self, "_sent_start"):
                    await self.send_standard_message(
                        msg_type="ASYNC_START",
                        data={"message_id": chunk.llm_message_id},
                    )
                    self._sent_start = True

                # Intermediate delta
                if chunk.content:
                    await self.send_standard_message(
                        msg_type="ASYNC_CONTENT",
                        content=chunk.content,
                        data={"message_id": chunk.llm_message_id},
                    )

                # Final chunk
                if chunk.is_complete:
                    sources: list[dict[str, Any]] = []
                    for src in chunk.sources or []:
                        sources.append(
                            {
                                "annotation_id": src.annotation_id,
                                "rawText": src.content,
                                "similarity_score": src.similarity_score,
                                **src.metadata,
                            }
                        )

                    await self.send_standard_message(
                        msg_type="ASYNC_FINISH",
                        data={
                            "sources": sources,
                            "message_id": chunk.llm_message_id,
                        },
                    )
                    if hasattr(self, "_sent_start"):
                        delattr(self, "_sent_start")

            logger.debug("[Session %s] Streaming complete.", self.session_id)

        except Exception as llm_err:  # noqa: BLE001
            logger.error(
                "[Session %s] LLM error while streaming: %s",
                self.session_id,
                llm_err,
                exc_info=True,
            )
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                data={"error": f"Error during processing: {llm_err}"},
            )
