"""
DocumentQueryConsumer

Provides a Channels WebSocket consumer for querying documents and streaming
results back to the frontend. The consumer maintains a Conversation record,
storing human and LLM messages for each session.

We define a custom DocumentAgent class that wraps the llama_index OpenAIAgent
and encapsulates database operations for reading/writing conversation messages.
"""

from __future__ import annotations

import json
import logging
import urllib.parse
import uuid
from typing import Any

from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from graphql_relay import from_global_id

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.conversations.models import MessageType
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import (
    ContentEvent,
    FinalEvent,
    SourceEvent,
    ThoughtEvent,
)

logger = logging.getLogger(__name__)

# Define a literal type for our standardized message types


class DocumentQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying documents with LLM support.
    Uses the new unified LLM API for framework-agnostic agent creation and
    conversation management.
    """

    agent = None
    document: Document | None = None
    corpus: Corpus | None = None

    # Each consumer instance will get a unique session_id created in connect()
    session_id: str | None = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.consumer_id = uuid.uuid4()  # Unique identifier for this instance
        logger.debug(f"[Consumer {self.consumer_id}] __init__ called.")

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event.

        NOTE
        ----
        This consumer *requires* a valid ``corpus_id`` in the WebSocket
        path (e.g. ``…/corpus/<GLOBAL_ID>/document/<GLOBAL_ID>/``).
        Any connection attempt without it is rejected.
        """
        self.session_id = str(uuid.uuid4())
        logger.debug(
            f"[Consumer {self.consumer_id} | Session {self.session_id}] connect() called. "
            f"Scope: {self.scope}"
        )

        try:
            # 1. User must be authenticated
            if not self.scope["user"].is_authenticated:
                logger.warning(
                    f"[Session {self.session_id}] User is not authenticated."
                )
                await self.close(code=4000)
                return

            # 2. The path MUST contain a corpus identifier
            if "/corpus/" not in self.scope["path"]:
                err_msg = (
                    "Missing corpus_id in WebSocket path. "
                    "Endpoint format: .../corpus/<ID>/document/<ID>/"
                )
                logger.error(f"[Session {self.session_id}] {err_msg}")
                await self.accept()
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content="",
                    data={"error": err_msg},
                )
                await self.close(code=4000)
                return

            # ------------------------------------------------------------------
            # 3. Extract & validate global IDs
            # ------------------------------------------------------------------
            graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
            graphql_doc_id = extract_websocket_path_id(self.scope["path"], "document")

            self.corpus_id = int(from_global_id(graphql_corpus_id)[1])
            self.document_id = int(from_global_id(graphql_doc_id)[1])

            # ------------------------------------------------------------------
            # 4. Fetch DB records – will raise DoesNotExist if invalid
            # ------------------------------------------------------------------
            self.corpus = await Corpus.objects.aget(id=self.corpus_id)
            self.document = await Document.objects.aget(id=self.document_id)

            logger.debug(
                f"[Session {self.session_id}] Loaded Document {self.document_id} "
                f"from Corpus {self.corpus_id}"
            )

            await self.accept()
            logger.debug(f"[Session {self.session_id}] Connection accepted.")

        except (ValueError, Corpus.DoesNotExist):
            # Covers bad path and unknown corpus IDs
            err_msg = "Invalid or missing corpus_id in WebSocket path."
            logger.error(f"[Session {self.session_id}] {err_msg}", exc_info=True)
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": err_msg},
            )
            await self.close(code=4000)

        except Document.DoesNotExist:
            err_msg = "Requested Document not found."
            logger.error(
                f"[Session {self.session_id}] {err_msg} (id={self.document_id})"
            )
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": err_msg},
            )
            await self.close(code=4000)

        except Exception as e:
            logger.error(
                f"[Session {self.session_id}] Error during connection: {str(e)}",
                exc_info=True,
            )
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during connection: {e}"},
            )
            await self.close(code=4000)

    async def disconnect(self, close_code: int) -> None:
        """
        Handles the WebSocket disconnection event, logs the session_id and close_code.
        """
        logger.debug(
            f"[Consumer {self.consumer_id} | Session {self.session_id}] disconnect() called."
        )
        self.agent = None

    async def send_standard_message(
        self,
        msg_type: MessageType,
        content: str = "",
        data: dict[str, Any] | None = None,
    ) -> None:
        """
        Sends a standardized message over the WebSocket in JSON format,
        logging session_id for better filtering in logs.
        """
        if data is None:
            data = {}

        await self.send(
            json.dumps({"type": msg_type, "content": content, "data": data})
        )

    async def generate_conversation_title(self, user_query: str) -> str:
        """
        Generates a concise conversation title based on the initial user query.

        Args:
            user_query: The first message from the user

        Returns:
            A short descriptive title for the conversation
        """

        from llama_index.core.llms import ChatMessage as LlamaChatMessage
        from llama_index.llms.openai import OpenAI

        system_prompt = (
            "You are a helpful assistant that creates very concise chat titles. "
            "Create a brief (maximum 5 words) title that captures the essence "
            "of what the user is asking about."
        )

        user_prompt = f"Create a brief title for a conversation starting with this query: {user_query}"

        llm = OpenAI(
            model="gpt-4o-mini",
            api_key=settings.OPENAI_API_KEY,
        )

        messages = [
            LlamaChatMessage(role="system", content=system_prompt),
            LlamaChatMessage(role="user", content=user_prompt),
        ]

        # Just in case the LLM fails, generate a random title
        try:
            response = llm.chat(messages)
            return response.message.content.strip()
        except Exception as e:
            logger.error(
                f"[Session {self.session_id}] Error generating conversation title: {e}"
            )
            return f"Conversation {uuid.uuid4()}"

    async def receive(self, text_data: str) -> None:
        """
        Receives a message from the WebSocket and processes a user query.

        Args:
            text_data: The raw text data from the WebSocket client.

        Returns:
            None
        """
        logger.debug(
            f"[Session {self.session_id}] receive() called with text_data: {text_data}"
        )

        try:
            text_data_json: dict[str, Any] = json.loads(text_data)
            user_query: str = text_data_json.get("query", "").strip()

            if not user_query:
                logger.warning(f"[Session {self.session_id}] Empty query received.")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content="No query provided.",
                )
                return

            logger.debug(
                f"[Session {self.session_id}] Received user query: '{user_query}'"
            )

            # If we haven't yet created an agent, do it now
            if self.agent is None:
                logger.debug(
                    f"[Session {self.session_id}] No agent loaded yet, initializing..."
                )

                # Parse conversation ID from query string if provided
                query_string = self.scope.get("query_string", b"").decode("utf-8")
                query_params = urllib.parse.parse_qs(query_string)
                load_convo_id_str = query_params.get(
                    "load_from_conversation_id", [None]
                )[0]

                conversation_id_from_query = None
                if load_convo_id_str:
                    try:
                        conversation_id_from_query = int(
                            from_global_id(load_convo_id_str)[1]
                        )
                        logger.debug(
                            f"[Session {self.session_id}] load existing conversation {conversation_id_from_query}"
                        )
                    except Exception as e:
                        logger.error(
                            f"[Session {self.session_id}] Could not parse convo ID from param: {str(e)}"
                        )
                        conversation_id_from_query = None

                # Create agent using new unified API
                logger.debug(
                    f"[Session {self.session_id}] Creating agent for document "
                    f"{self.document.id if self.document else 'UNKNOWN'}"
                )

                agent_kwargs = {
                    "document": self.document,
                    "corpus": self.corpus,
                    "user_id": self.scope["user"].id,
                }

                if conversation_id_from_query:
                    agent_kwargs["conversation_id"] = conversation_id_from_query

                # Logging for preferred_embedder - does not affect agent_kwargs for corpus
                if (
                    self.corpus
                    and hasattr(self.corpus, "preferred_embedder")
                    and self.corpus.preferred_embedder
                ):
                    logger.debug(
                        f"[Session {self.session_id}] Corpus {self.corpus.id} "
                        f"has a preferred_embedder: {self.corpus.preferred_embedder}. "
                        "Agent factory will use this if applicable."
                    )
                elif self.corpus:
                    logger.debug(
                        f"[Session {self.session_id}] Corpus {self.corpus.id} "
                        "does not have a preferred_embedder specified. Agent factory will use defaults."
                    )
                else:  # Should not happen if connect() succeeded
                    logger.warning(
                        f"[Session {self.session_id}] self.corpus is None "
                        "during agent initialization. This is unexpected."
                    )

                self.agent = await agents.for_document(
                    **agent_kwargs, framework=settings.LLMS_DEFAULT_AGENT_FRAMEWORK
                )

                # Enhanced Logging after agent initialization
                if self.agent and self.agent.get_conversation_id():
                    logger.debug(
                        f"[Session {self.session_id}] Agent NEWLY INITIALIZED "
                        f"for doc {self.document_id} with conversation ID: "
                        f"{self.agent.get_conversation_id()}"
                    )
                elif self.agent:
                    logger.debug(
                        f"[Session {self.session_id}] Agent NEWLY INITIALIZED "
                        f"for doc {self.document_id} (anonymous or new conversation)."
                    )

            # Enhanced Logging for existing agent instance
            elif self.agent and self.agent.get_conversation_id():
                logger.debug(
                    f"[Session {self.session_id}] Using EXISTING agent "
                    f"for doc {self.document_id} with conversation ID: "
                    f"{self.agent.get_conversation_id()}"
                )
            elif self.agent:
                logger.debug(
                    f"[Session {self.session_id}] Using EXISTING agent "
                    f"for doc {self.document_id} (anonymous or new conversation)."
                )

            # Use the new streaming API
            logger.debug(
                f"[Session {self.session_id}] Calling agent.stream with query: '{user_query}'"
            )

            try:
                # Stream the response
                async for event in self.agent.stream(user_query):
                    # Ensure start message once we have IDs (present on all event types now)
                    if getattr(
                        event, "user_message_id", None
                    ) is not None and not hasattr(self, "_sent_start"):
                        await self.send_standard_message(
                            msg_type="ASYNC_START",
                            content="",
                            data={"message_id": event.llm_message_id},
                        )
                        self._sent_start = True

                    if isinstance(event, ThoughtEvent):
                        await self.send_standard_message(
                            msg_type="ASYNC_THOUGHT",
                            content=event.thought,
                            data={"message_id": event.llm_message_id, **event.metadata},
                        )

                    elif isinstance(event, ContentEvent):
                        if event.content:
                            await self.send_standard_message(
                                msg_type="ASYNC_CONTENT",
                                content=event.content,
                                data={"message_id": event.llm_message_id},
                            )

                    elif isinstance(event, SourceEvent):
                        if event.sources:
                            await self.send_standard_message(
                                msg_type="ASYNC_SOURCES",
                                content="",  # no textual content
                                data={
                                    "message_id": event.llm_message_id,
                                    "sources": [s.to_dict() for s in event.sources],
                                },
                            )

                    elif isinstance(event, FinalEvent):
                        # Prepare sources data (if not already sent)
                        sources_payload = [s.to_dict() for s in event.sources]
                        await self.send_standard_message(
                            msg_type="ASYNC_FINISH",
                            content=event.accumulated_content or event.content,
                            data={
                                "sources": sources_payload,
                                "message_id": event.llm_message_id,
                                "timeline": (
                                    event.metadata.get("timeline", [])
                                    if isinstance(event.metadata, dict)
                                    else []
                                ),
                            },
                        )

                        # Reset flag
                        if hasattr(self, "_sent_start"):
                            delattr(self, "_sent_start")

                    else:
                        # ------------------------------------------------------------------
                        # Legacy path: llama-index still yields UnifiedStreamResponse.
                        # Treat it as a content event / final event analogue.
                        # ------------------------------------------------------------------
                        if hasattr(event, "content") and event.content:
                            await self.send_standard_message(
                                msg_type="ASYNC_CONTENT",
                                content=str(event.content),
                                data={"message_id": event.llm_message_id},
                            )

                        if getattr(event, "is_complete", False):
                            sources_payload = []
                            if hasattr(event, "sources") and event.sources:
                                sources_payload = [s.to_dict() for s in event.sources]

                            await self.send_standard_message(
                                msg_type="ASYNC_FINISH",
                                content=getattr(event, "accumulated_content", ""),
                                data={
                                    "sources": sources_payload,
                                    "message_id": event.llm_message_id,
                                    "timeline": (
                                        event.metadata.get("timeline", [])
                                        if isinstance(event.metadata, dict)
                                        else []
                                    ),
                                },
                            )

                            if hasattr(self, "_sent_start"):
                                delattr(self, "_sent_start")

                logger.debug(
                    f"[Session {self.session_id}] Completed streaming response"
                )

            except Exception as api_error:
                logger.error(
                    f"[Session {self.session_id}] Error during API call: {str(api_error)}",
                    exc_info=True,
                )
                # Re-raise to be caught by outer exception handler
                raise

        except Exception as e:
            logger.error(
                f"[Session {self.session_id}] Error during message processing: {e}",
                exc_info=True,
            )
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during message processing: {e}"},
            )
