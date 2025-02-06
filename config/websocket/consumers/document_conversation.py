from __future__ import annotations

from django.conf import settings

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
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from graphql_relay import from_global_id
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
import urllib.parse

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.conversations.models import Conversation, ChatMessage
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents import (
    MessageType,
    OpenContractDbAgent,
    create_document_agent,
)
from llama_index.llms.openai import OpenAI
    
logger = logging.getLogger(__name__)

# Define a literal type for our standardized message types


class DocumentQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying documents with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages. Streams or returns results back to the client.
    """

    conversation: Conversation | None = None
    agent: OpenContractDbAgent | None = None

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event. Attempts to load the associated Document,
        sets up the LLM embedding model and query engine, and accepts the connection.

        Raises:
            ValueError: if the path does not contain a valid document ID.
            Document.DoesNotExist: if no matching Document is found.
        """
        logger.debug("WebSocket connection attempt received")
        logger.debug(f"Connection scope: {self.scope}")

        try:
            
            self.new_conversation = False
            
            if not self.scope["user"].is_authenticated:
                logger.warning("User is not authenticated")
                await self.close(code=4000)
                return

            # Extract a numeric Document ID from path
            graphql_doc_id = extract_websocket_path_id(self.scope["path"], "document")
            self.document_id = int(from_global_id(graphql_doc_id)[1])
            logger.debug(f"Extracted document_id: {self.document_id}")

            # Load the Document from DB
            self.document = await Document.objects.aget(id=self.document_id)

            # Parse query parameters for optional load_from_conversation_id
            query_string = self.scope.get('query_string', b'').decode('utf-8')
            query_params = urllib.parse.parse_qs(query_string)
            load_convo_id_str = query_params.get('load_from_conversation_id', [None])[0]
            prefix_messages = None
            if load_convo_id_str:
                try:
                    load_convo_id = int(from_global_id(load_convo_id_str)[1])
                    self.conversation = await Conversation.objects.aget(id=load_convo_id)

                    # Load ChatMessage instances for the given conversation, ordered by creation time
                    prefix_messages = await ChatMessage.objects.afilter(conversation_id=load_convo_id).order_by('created')
                    prefix_messages = list(prefix_messages)
                    logger.debug(f"Loaded {len(prefix_messages)} prefix messages from conversation {load_convo_id}")
                except Exception as e:
                    logger.error(f"Could not load prefix messages: {str(e)}")
                    prefix_messages = None
            else:
                self.conversation = await Conversation.objects.create(
                    creator=self.scope["user"],
                    title=f"Document {self.document_id} Conversation",
                    chat_with_document=self.document,
                )
            
            self.new_conversation = await self.conversation.chat_messages.all().acount() == 0    
            
            # Initialize the underlying Llama agent with optional prefix messages
            underlying_llama_agent = await create_document_agent(
                document=self.document_id,
                user_id=self.scope["user"].id,
                loaded_messages=prefix_messages
            )

            # Initialize our custom DocumentAgent instance
            self.agent = OpenContractDbAgent(
                conversation=self.conversation,
                user_id=self.scope["user"].id
                if self.scope["user"].is_authenticated
                else None,
                agent=underlying_llama_agent,
            )

            logger.debug("Accepting WebSocket connection")
            await self.accept()
            logger.debug("WebSocket connection accepted")

        except ValueError as v_err:
            logger.error(f"Invalid document path: {v_err}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Invalid document path: {v_err}"},
            )
            await self.close(code=4000)
        except Document.DoesNotExist:
            logger.error(f"Document not found: {self.document_id}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": "Requested Document not found."},
            )
            await self.close(code=4000)
        except Exception as e:
            logger.error(f"Error during connection: {str(e)}", exc_info=True)
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
        logger.debug(f"WebSocket disconnected with code: {close_code}")
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
            f"Sending message - Type: {msg_type}, Content length: {len(content)}"
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
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_prompt),
        ]
        
        response = llm.chat(messages)
        return response.message.content.strip()

    async def receive(self, text_data: str) -> None:
        """
        Handles incoming WebSocket messages from the client. Expected input is JSON containing:
            {
                "query": "Some user query"
            }
        """
        logger.debug(f"WebSocket received message: {text_data}")

        try:
            text_data_json: dict[str, Any] = json.loads(text_data)
            user_query: str = text_data_json.get("query", "").strip()

            if not user_query:
                logger.warning("Empty query received")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content="No query provided.",
                )
                return

            # Generate title if this is a new conversation without any messages
            if self.new_conversation:
                title = await self.generate_conversation_title(user_query)
                self.conversation.title = title
                await self.conversation.asave()

            # Start partial-token streaming
            logger.debug("Sending ASYNC_START to client")
            await self.send_standard_message(
                msg_type="ASYNC_START",
                content="Starting asynchronous content streaming...",
            )

            # The agent will store the user message in DB,
            # then return a streaming or normal response object
            logger.debug("Calling DocumentAgent to handle user message asynchronously")
            response = await self.agent.astream_chat(user_query)

            # If it's streaming-based, gather tokens from the generator
            if isinstance(response, StreamingAgentChatResponse):
                logger.debug("Processing streaming response from the agent")
                llm_response_buffer = ""

                async for token in response.async_response_gen():
                    logger.debug(f"Emitting partial token: {token}")
                    llm_response_buffer += token
                    await self.send_standard_message(
                        msg_type="ASYNC_CONTENT",
                        content=token,
                    )

                sources_str = ""
                if response.source_nodes:
                    # You can adjust how source nodes are conveyed to the frontend
                    sources_str = json.dumps(
                        [sn.model_extra for sn in response.source_nodes],
                        indent=4,
                    )

                # Store final LLM text after streaming completes
                logger.debug("Storing final LLM message into DB")
                await self.agent.store_final_llm_message(llm_response_buffer)

                logger.debug("Sending ASYNC_FINISH message")
                await self.send_standard_message(
                    msg_type="ASYNC_FINISH",
                    content=llm_response_buffer,
                    data={"sources": sources_str},
                )

            else:
                # Non-streaming response
                logger.debug("Processing non-streaming response from the agent")
                final_text: str = getattr(response, "response", "")
                sources_str = ""
                if hasattr(response, "source_nodes") and response.source_nodes:
                    sources_str = response.get_formatted_sources()

                # Store final (non-streamed) LLM text in DB
                logger.debug("Storing final LLM message into DB")
                await self.agent.store_final_llm_message(final_text)

                logger.debug("Sending SYNC_CONTENT message")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content=final_text,
                    data={"sources": sources_str},
                )

        except Exception as e:
            logger.error(f"Error during message processing: {e}", exc_info=True)
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during message processing: {e}"},
            )
