from __future__ import annotations

import uuid

from django.conf import settings

from opencontractserver.corpuses.models import Corpus

"""
DocumentQueryConsumer

Provides a Channels WebSocket consumer for querying documents and streaming
results back to the frontend. The consumer maintains a Conversation record,
storing human and LLM messages for each session.

We define a custom DocumentAgent class that wraps the llama_index OpenAIAgent
and encapsulates database operations for reading/writing conversation messages.
"""

import json
import logging
import urllib.parse
from typing import Any

from channels.generic.websocket import AsyncWebsocketConsumer
from graphql_relay import from_global_id
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.core.llms import ChatMessage as LlamaChatMessage
from llama_index.llms.openai import OpenAI

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents import (
    MessageType,
    OpenContractDbAgent,
    create_document_agent,
)

logger = logging.getLogger(__name__)

# Define a literal type for our standardized message types


class DocumentQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying documents with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages.
    """

    conversation: Conversation | None = None
    agent: OpenContractDbAgent | None = None
    document: Document | None = None
    new_conversation: bool = False

    # Each consumer instance will get a unique session_id created in connect()
    session_id: str | None = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.consumer_id = uuid.uuid4()  # Unique identifier for this instance
        logger.info(f"[Consumer {self.consumer_id}] __init__ called.")

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event.
        - Verifies the user is authenticated.
        - Attempts to load the associated Document.
        - Accepts the connection and logs the session_id for debugging.
        """
        self.session_id = str(uuid.uuid4())
        logger.info(
            f"[Consumer {self.consumer_id} | Session {self.session_id}] connect() called. Scope: {self.scope}"
        )

        try:
            if not self.scope["user"].is_authenticated:
                logger.warning(
                    f"[Session {self.session_id}] User is not authenticated."
                )
                await self.close(code=4000)
                return

            # Extract a numeric Document ID from path
            graphql_doc_id = extract_websocket_path_id(self.scope["path"], "document")
            self.document_id = int(from_global_id(graphql_doc_id)[1])
            logger.info(
                f"[Session {self.session_id}] Extracted document_id: {self.document_id}"
            )

            # Try to extract optional corpus_id
            try:
                # Check if "corpus" is in the path, if so, try to extract it
                if "/corpus/" in self.scope["path"]:
                    graphql_corpus_id = extract_websocket_path_id(
                        self.scope["path"], "corpus"
                    )
                    self.corpus_id = int(from_global_id(graphql_corpus_id)[1])
                    self.corpus = await Corpus.objects.aget(id=self.corpus_id)
                    logger.info(
                        f"[Session {self.session_id}] Extracted corpus_id: {self.corpus_id}"
                    )
                else:
                    self.corpus_id = None
                    self.corpus = None
                    logger.info(f"[Session {self.session_id}] No corpus_id in path")
            except ValueError:
                # If there's an error extracting corpus_id, it's not there
                self.corpus_id = None
                logger.info(
                    f"[Session {self.session_id}] No valid corpus_id found in path"
                )

            # Load the Document from DB
            self.document = await Document.objects.aget(id=self.document_id)

            logger.info(f"[Session {self.session_id}] Accepting WebSocket connection.")
            await self.accept()
            logger.info(f"[Session {self.session_id}] Connection accepted.")

        except ValueError as v_err:
            logger.error(f"[Session {self.session_id}] Invalid document path: {v_err}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Invalid document path: {v_err}"},
            )
            await self.close(code=4000)
        except Document.DoesNotExist:
            logger.error(
                f"[Session {self.session_id}] Document not found: {self.document_id}"
            )
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": "Requested Document not found."},
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
        logger.info(
            f"[Consumer {self.consumer_id} | Session {self.session_id}] disconnect() called."
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
        logger.info(
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

            logger.info(
                f"[Session {self.session_id}] Received user query: '{user_query}'"
            )

            # If we haven't yet loaded/created a Conversation, do it now
            if self.conversation is None:
                logger.info(
                    f"[Session {self.session_id}] No conversation loaded yet, initializing..."
                )
                # Attempt to parse 'load_from_conversation_id' from query string
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
                    # Create a brand new conversation
                    logger.info(
                        f"[Session {self.session_id}] Creating new conversation"
                    )
                    self.conversation = await Conversation.objects.acreate(
                        creator=self.scope["user"],
                        title="",  # Temporary empty title, will be replaced below
                        chat_with_document=self.document,
                    )
                    logger.info(
                        f"[Session {self.session_id}] Created new conversation with ID {self.conversation.id}"
                    )
                    prefix_messages = []
                    self.new_conversation = True

                # Initialize the underlying Llama agent with optional prefix messages
                logger.info(
                    f"[Session {self.session_id}] Creating document agent for document {self.document_id}"
                )
                underlying_llama_agent = await create_document_agent(
                    document=self.document_id,
                    user_id=self.scope["user"].id,
                    loaded_messages=prefix_messages if prefix_messages else None,
                    override_conversation=self.conversation,
                    embedder_path=self.corpus.preferred_embedder,
                )

                # Initialize our custom agent
                logger.info(
                    f"[Session {self.session_id}] Initializing OpenContractDbAgent wrapper"
                )
                self.agent = underlying_llama_agent  # It's already wrapped!

            # If conversation is brand new and has no chat messages, rename it
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

            # Then create a placeholder for the LLM's message
            message_id = await self.agent.store_llm_message("")
            logger.info(
                f"[Session {self.session_id}] Created placeholder message with ID: {message_id}"
            )

            # Then call the agent to generate a response, ensure NOT to resave user message
            logger.info(
                f"[Session {self.session_id}] Calling agent.astream_chat with query: '{user_query}'"
            )

            try:
                response = await self.agent.astream_chat(
                    user_query, store_user_message=False
                )
                logger.info(
                    f"[Session {self.session_id}] Got initial response of type: {type(response)}"
                )
            except Exception as api_error:
                logger.error(
                    f"[Session {self.session_id}] Error during OpenAI API call: {str(api_error)}",
                    exc_info=True,
                )
                # Re-raise to be caught by outer exception handler
                raise

            if isinstance(response, StreamingAgentChatResponse):
                logger.info(
                    f"[Session {self.session_id}] Processing StreamingAgentChatResponse"
                )

                await self.send_standard_message(
                    msg_type="ASYNC_START",
                    content="",
                    data={"message_id": message_id},
                )
                llm_response_buffer = ""
                token_count = 0

                try:
                    logger.info(
                        f"[Session {self.session_id}] Starting to iterate through streaming tokens"
                    )
                    async for token in response.async_response_gen():
                        token_count += 1
                        if (
                            token_count % 50 == 0
                        ):  # Log every 50 tokens to avoid excessive logging
                            logger.info(
                                f"[Session {self.session_id}] Received {token_count} tokens so far"
                            )

                        llm_response_buffer += token
                        await self.send_standard_message(
                            msg_type="ASYNC_CONTENT",
                            content=token,
                            data={"message_id": message_id},
                        )
                    logger.info(
                        f"[Session {self.session_id}] Completed token streaming, received {token_count} tokens total"
                    )
                except Exception as stream_error:
                    logger.error(
                        f"[Session {self.session_id}] Error during token streaming: {str(stream_error)}",
                        exc_info=True,
                    )
                    raise

                # Gather final sources (if any)
                sources = {}

                # Log response sources
                logger.info(
                    f"[Session {self.session_id}] Response has sources: {bool(response.sources)}"
                )
                logger.info(
                    f"[Session {self.session_id}] Response has source_nodes: {bool(response.source_nodes)}"
                )

                if response.sources:
                    for idx, source in enumerate(response.sources):
                        raw_output = source.raw_output
                        if hasattr(raw_output, "source_nodes"):
                            for sn_idx, sn in enumerate(raw_output.source_nodes):
                                sources[sn.metadata["annotation_id"]] = {
                                    **sn.metadata,
                                    "rawText": sn.text,
                                }

                if response.source_nodes:
                    for sn_idx, sn in enumerate(response.source_nodes):
                        sources[sn.metadata["annotation_id"]] = {
                            **sn.metadata,
                            "rawText": sn.text,
                        }

                data = {"sources": list(sources.values()), "message_id": message_id}

                logger.info(
                    f"[Session {self.session_id}] Updating message {message_id} with final content"
                )
                await self.agent.update_message(
                    llm_response_buffer, message_id, data=data
                )

                logger.info(f"[Session {self.session_id}] Sending ASYNC_FINISH message")
                await self.send_standard_message(
                    msg_type="ASYNC_FINISH",
                    content=llm_response_buffer,
                    data=data,
                )

            else:
                logger.info(
                    f"[Session {self.session_id}] Processing non-streaming response of type: {type(response)}"
                )
                final_text: str = getattr(response, "response", "")
                logger.info(
                    f"[Session {self.session_id}] Got response text of length: {len(final_text)}"
                )
                await self.agent.update_message(final_text, message_id)

                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content=final_text,
                    data={"message_id": message_id},
                )

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
