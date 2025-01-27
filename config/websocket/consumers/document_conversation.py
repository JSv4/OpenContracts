"""
DocumentQueryConsumer

Provides a Channels WebSocket consumer for querying documents and streaming
results back to the frontend. The consumer maintains a Conversation record,
storing human and LLM messages for each session.
"""

import json
import logging
from typing import Any, Literal, Optional

from graphql_relay import from_global_id

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from llama_index.agent.openai import OpenAIAgent
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from config.websocket.utils.extract_ids import extract_document_id
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.documents.models import Document
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

logger = logging.getLogger(__name__)

# Define a literal type for our standardized message types
MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


class DocumentQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying documents with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages. Streams or returns results back to the client.
    """

    conversation: Optional[Conversation] = None
    llm_response_buffer: str = ""

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event. Attempts to load the associated Document,
        sets up the LLM embedding model and query engine, and accepts the connection.

        Raises:
            ValueError: if the path does not contain a valid document ID.
            Document.DoesNotExist: if no matching Document is found.
        """
        logger.info("WebSocket connection attempt received")
        logger.debug(f"Connection scope: {self.scope}")

        try:

            if not self.scope["user"].is_authenticated:
                logger.warn("User is not authenticated")
                await self.close(code=4000)
                return

            graphql_doc_id = extract_document_id(self.scope["path"])
            self.document_id = from_global_id(graphql_doc_id)[1]
            logger.debug(f"Extracted document_id: {self.document_id}")

            self.document = await Document.objects.aget(id=self.document_id)
            logger.debug(f"Found document: {self.document.title}")

            logger.debug("Setting up embedding model...")
            embed_model = HuggingFaceEmbedding(
                "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
            )
            Settings.embed_model = embed_model

            logger.debug("Setting up LLM...")
            llm = OpenAI(
                model=settings.OPENAI_MODEL,
                api_key=settings.OPENAI_API_KEY,
                streaming=True,
            )
            Settings.llm = llm

            logger.debug("Setting up vector store...")
            vector_store = DjangoAnnotationVectorStore.from_params(
                document_id=self.document.id
            )
            index = VectorStoreIndex.from_vector_store(
                vector_store=vector_store, use_async=False
            )  # use_async=True doesn't work as llama creates nested async loop in run_async_tasks

            logger.debug("Setting up query engine...")
            doc_engine = index.as_query_engine(similarity_top_k=10, streaming=False)
            query_engine_tools = [
                QueryEngineTool(
                    query_engine=doc_engine,
                    metadata=ToolMetadata(
                        name="doc_engine",
                        description=(
                            f"Provides detailed annotations and text from within the {self.document.title}"
                        ),
                    ),
                )
            ]

            logger.debug("Setting up OpenAI agent...")
            self.agent = OpenAIAgent.from_tools(query_engine_tools, verbose=True)

            logger.debug(
                f"User authentication status: {self.scope['user'].is_authenticated}"
            )

            logger.debug("Creating conversation record...")
            self.conversation = await database_sync_to_async(
                Conversation.objects.create
            )(
                creator=self.scope["user"]
                if self.scope["user"].is_authenticated
                else None,
                title=f"Document {self.document_id} Conversation",
            )

            logger.debug("Accepting WebSocket connection")
            await self.accept()
            logger.debug("WebSocket connection accepted")

        except ValueError as v_err:
            logger.error(f"Websocket - Invalid document path: {v_err}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Invalid document path: {v_err}"},
            )
            await self.close(code=4000)
        except Document.DoesNotExist:
            logger.error(f"Websocket - Document not found: {self.document_id}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": "Requested Document not found."},
            )
            await self.close(code=4000)
        except Exception as e:
            logger.error(f"Websocket - Error during connection: {str(e)}", exc_info=True)
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
        msg_type: MessageType,
        content: str = "",
        data: Optional[dict[str, Any]] = None,
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

    async def receive(self, text_data: str) -> None:
        """
        Handles incoming WebSocket messages.
        """
        logger.debug(f"Websocker received message: {text_data}")

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

            # Store user's query as a HUMAN message, if conversation is present
            if self.conversation is not None:
                logger.debug("Creating HUMAN message record")
                await database_sync_to_async(ChatMessage.objects.create)(
                    creator=self.scope["user"],
                    conversation=self.conversation,
                    msg_type="HUMAN",
                    content=user_query,
                )

            modified_query_str = (
                f"Please return a nicely formatted markdown string:\n\n{user_query}"
            )

            # Begin streaming messages
            logger.debug("Starting async content streaming")
            await self.send_standard_message(
                msg_type="ASYNC_START",
                content="Starting asynchronous content streaming...",
            )

            llm_message = None
            if self.conversation is not None:
                logger.debug("Creating LLM message stub")
                llm_message = await database_sync_to_async(ChatMessage.objects.create)(
                    creator=self.scope["user"],
                    conversation=self.conversation,
                    msg_type="LLM",
                    content="",  # Will update once streaming is complete
                )

            # Perform an async streaming chat with the agent
            logger.debug("Starting agent chat stream")
            response = await self.agent.astream_chat(modified_query_str)

            # For a StreamingAgentChatResponse, we iterate over tokens
            if isinstance(response, StreamingAgentChatResponse):
                logger.debug(f"Processing streaming response: {response}")
                llm_response_buffer = ""

                async for token in response.async_response_gen():
                    logger.debug(f"Streaming token {type(token)}: {token}")
                    llm_response_buffer += token
                    await self.send_standard_message(
                        msg_type="ASYNC_CONTENT",
                        content=token,
                    )

                sources_str = ""
                if response.source_nodes:
                    sources_str = response.get_formatted_sources()
                    logger.debug(f"Found {len(response.source_nodes)} source nodes")

                # Update the LLM message with final content
                if llm_message:
                    logger.debug("Updating LLM message with final content")
                    llm_message.content = llm_response_buffer
                    await database_sync_to_async(llm_message.save)()

                logger.debug("Sending ASYNC_FINISH message")
                await self.send_standard_message(
                    msg_type="ASYNC_FINISH",
                    content=llm_response_buffer,
                    data={"sources": sources_str},
                )

            else:
                logger.debug("Processing non-streaming response")
                # If streaming is not available, we get a single chunk from a normal AgentChatResponse
                non_streamed_response: str = getattr(response, "response", "")
                sources_str = ""
                if hasattr(response, "source_nodes") and response.source_nodes:
                    sources_str = response.get_formatted_sources()
                    logger.debug(f"Found {len(response.source_nodes)} source nodes")

                if llm_message:
                    logger.debug("Updating LLM message with final content")
                    llm_message.content = non_streamed_response
                    await database_sync_to_async(llm_message.save)()

                logger.debug("Sending SYNC_CONTENT message")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content=non_streamed_response,
                    data={"sources": sources_str},
                )

        except Exception as e:
            logger.error(f"Error during message processing: {e}", exc_info=True)
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during message processing: {e}"},
            )
