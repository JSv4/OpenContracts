from __future__ import annotations

"""
CorpusQueryConsumer

Provides a Channels WebSocket consumer for querying corpuses and streaming
results back to the frontend. The consumer maintains a Conversation record,
storing human and LLM messages for each session.

We define a custom CorpusAgent by using create_corpus_agent and encapsulate
database operations for reading/writing conversation messages.
"""

import json
import logging
import urllib.parse
import uuid
from typing import Any

from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from graphql_relay import from_global_id
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.core.llms import ChatMessage as LlamaChatMessage
from llama_index.llms.openai import OpenAI

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.llms.agents import (
    MessageType,
    OpenContractDbAgent,
    create_corpus_agent,
)

logger = logging.getLogger(__name__)


class CorpusQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying corpuses with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages for each session. Streams or returns results back to the client.
    This consumer now follows the lazy conversation initialization logic used in the document consumer.
    """

    conversation: Conversation | None = None
    agent: OpenContractDbAgent | None = None
    corpus: Corpus | None = None
    new_conversation: bool = False
    session_id: str | None = None

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event.
        - Verifies the user is authenticated.
        - Loads the associated Corpus.
        - Accepts the connection.
        """
        logger.debug("WebSocket connection attempt for corpus received.")
        logger.debug(f"Connection scope: {self.scope}")
        try:
            if not self.scope["user"].is_authenticated:
                logger.warning("User is not authenticated.")
                await self.close(code=4000)
                return

            graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
            self.corpus_id = from_global_id(graphql_corpus_id)[1]
            logger.debug(f"Extracted corpus_id: {self.corpus_id}")

            self.corpus = await Corpus.objects.aget(id=self.corpus_id)
            logger.debug(f"Found corpus: {self.corpus.title}")

            # Initialize session_id for debugging and title generation
            self.session_id = str(uuid.uuid4())
            logger.debug(
                f"[Session {self.session_id}] Accepting WebSocket connection (corpus)."
            )
            await self.accept()
            logger.debug(f"[Session {self.session_id}] Connection accepted (corpus).")

        except ValueError as v_err:
            logger.error(f"[Session {self.session_id}] Invalid corpus path: {v_err}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Invalid corpus path: {v_err}"},
            )
            await self.close(code=4000)
        except Corpus.DoesNotExist:
            logger.error(
                f"[Session {self.session_id}] Corpus not found: {getattr(self, 'corpus_id', 'Unknown')}"
            )
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": "Requested Corpus not found."},
            )
            await self.close(code=4000)
        except Exception as e:
            logger.error(
                f"[Session {self.session_id}] Error during corpus connection: {str(e)}",
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
        Handles the WebSocket disconnection event.
        """
        logger.debug(
            f"[Session {self.session_id}] Corpus WebSocket disconnected with code: {close_code}"
        )
        self.conversation = None
        self.agent = None

    async def send_standard_message(
        self,
        msg_type: type[MessageType],
        content: str = "",
        data: dict[str, Any] | None = None,
    ) -> None:
        """
        Sends a standardized message over the WebSocket in JSON format.
        """
        if data is None:
            data = {}
        logger.debug(
            f"[Session {self.session_id}] Sending message - Type: {msg_type}, Content length: {len(content)}"
        )
        await self.send(
            json.dumps({"type": msg_type, "content": content, "data": data})
        )

    async def generate_conversation_title(self, user_query: str) -> str:
        """
        Generates a concise conversation title based on the initial user query.

        Args:
            user_query: The first message from the user

        Returns:
            A short descriptive title for the conversation.
        """
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
        Handles incoming WebSocket messages from the client. Expected input is JSON containing:
            {
                "query": "Some user query"
            }
        """
        logger.debug(
            f"[Session {self.session_id}] Corpus WebSocket received message: {text_data}"
        )
        try:
            text_data_json: dict[str, Any] = json.loads(text_data)
            user_query: str = text_data_json.get("query", "").strip()

            if not user_query:
                logger.warning(
                    f"[Session {self.session_id}] Empty query received (corpus)."
                )
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content="No query provided.",
                )
                return

            # Lazy initialization: if no conversation is loaded, initialize it.
            if self.conversation is None:
                logger.info(
                    f"[Session {self.session_id}] No conversation loaded yet, initializing..."
                )
                query_string = self.scope.get("query_string", b"").decode("utf-8")
                query_params = urllib.parse.parse_qs(query_string)
                load_convo_id_str = query_params.get(
                    "load_from_conversation_id", [None]
                )[0]

                if load_convo_id_str:
                    try:
                        load_convo_id = int(from_global_id(load_convo_id_str)[1])
                        logger.info(
                            f"[Session {self.session_id}] Attempting to load existing conversation {load_convo_id}"
                        )
                        self.conversation = await Conversation.objects.aget(
                            id=load_convo_id
                        )
                        logger.info(
                            f"[Session {self.session_id}] Successfully loaded conversation {load_convo_id}"
                        )
                        prefix_messages = [
                            msg
                            async for msg in ChatMessage.objects.filter(
                                conversation_id=load_convo_id
                            ).order_by("created")
                        ]
                        logger.info(
                            f"[Session {self.session_id}] Loaded {len(prefix_messages)} prefix messages"
                        )
                    except Exception as e:
                        logger.error(
                            f"[Session {self.session_id}] Could not load prefix messages: {str(e)}"
                        )
                        prefix_messages = []
                        self.conversation = None
                else:
                    logger.info(
                        f"[Session {self.session_id}] Creating new conversation"
                    )
                    self.conversation = await Conversation.objects.acreate(
                        creator=self.scope["user"],
                        title="",
                        chat_with_corpus=self.corpus,
                    )
                    logger.info(
                        f"[Session {self.session_id}] Created new conversation with ID {self.conversation.id}"
                    )
                    prefix_messages = []
                    self.new_conversation = True

                # Initialize the underlying corpus agent
                underlying_agent = await create_corpus_agent(
                    corpus_id=self.corpus.id,
                    user_id=self.scope["user"].id,
                    override_conversation=self.conversation,
                    loaded_messages=prefix_messages if prefix_messages else None,
                )

                # It's already wrapped, just like in document_conversation.py
                self.agent = underlying_agent

            # If conversation is new and has no chat messages, generate a title for the conversation.
            if (
                self.new_conversation
                and await self.conversation.chat_messages.all().acount() == 0
            ):
                logger.info(
                    f"[Session {self.session_id}] Generating title for new conversation"
                )
                title = await self.generate_conversation_title(user_query)
                self.conversation.title = title
                await self.conversation.asave()
                logger.info(
                    f"[Session {self.session_id}] Set conversation title to: {title}"
                )
                self.new_conversation = False

            # Store user message BEFORE LLM message stored
            await ChatMessage.objects.acreate(
                creator_id=self.scope["user"].id,
                conversation=self.conversation,
                msg_type="HUMAN",
                content=user_query,
            )

            # Create a placeholder for the LLM's message
            message_id = await self.agent.store_llm_message("")

            # Invoke the agent to generate a response, ensuring not to resave the user message.
            response = await self.agent.astream_chat(
                user_query, store_user_message=False
            )

            if isinstance(response, StreamingAgentChatResponse):
                await self.send_standard_message(
                    msg_type="ASYNC_START",
                    content="",
                    data={"message_id": message_id},
                )
                llm_response_buffer = ""
                token_count = 0

                async for token in response.async_response_gen():
                    token_count += 1
                    llm_response_buffer += token
                    await self.send_standard_message(
                        msg_type="ASYNC_CONTENT",
                        content=token,
                        data={"message_id": message_id},
                    )

                # Gather final sources (if any)
                sources = {}
                if hasattr(response, "sources") and response.sources:
                    for source in response.sources:
                        raw_output = source.raw_output
                        if hasattr(raw_output, "source_nodes"):
                            for sn in raw_output.source_nodes:
                                sources[sn.metadata["annotation_id"]] = {
                                    **sn.metadata,
                                    "rawText": sn.text,
                                }

                if hasattr(response, "source_nodes") and response.source_nodes:
                    for sn in response.source_nodes:
                        sources[sn.metadata["annotation_id"]] = {
                            **sn.metadata,
                            "rawText": sn.text,
                        }

                data = {"sources": list(sources.values()), "message_id": message_id}

                await self.agent.update_message(
                    llm_response_buffer, message_id, data=data
                )

                await self.send_standard_message(
                    msg_type="ASYNC_FINISH",
                    content=llm_response_buffer,
                    data=data,
                )
            else:
                final_text: str = getattr(response, "response", "")
                await self.agent.update_message(final_text, message_id)
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content=final_text,
                    data={"message_id": message_id},
                )

        except Exception as e:
            logger.error(
                f"[Session {self.session_id}] Error during corpus message processing: {e}",
                exc_info=True,
            )
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during message processing: {e}"},
            )
