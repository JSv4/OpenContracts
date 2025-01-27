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
from typing import Any, Literal, Optional, Type, Union

from graphql_relay import from_global_id

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from llama_index.core.base.llms.types import ChatMessage as LlamaChatMessage
from llama_index.agent.openai import OpenAIAgent
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.chat_engine.types import (
    AgentChatResponse,
    StreamingAgentChatResponse,
)
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from config.websocket.utils.extract_ids import extract_document_id
from opencontractserver.conversations.models import (
    ChatMessage,
    Conversation,
)
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools import (
    load_document_md_summary_tool,
    get_md_summary_token_length_tool,
    get_notes_for_document_corpus_tool,
    get_note_content_token_length_tool,
    get_partial_note_content_tool,
)
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

logger = logging.getLogger(__name__)

# Define a literal type for our standardized message types
MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


class DocumentAgent:
    """
    A wrapper around the llama_index OpenAIAgent that also handles:
      1) Loading or creating a Conversation record
      2) Storing user and LLM messages to the DB

    Because partial-token streaming is best handled at the Consumer (to stream
    tokens to the client), we allow the DocumentQueryConsumer to manage the
    generator tokens. This agent's async method returns a StreamingAgentChatResponse
    or an AgentChatResponse, which the consumer can iterate over to handle partial
    streaming and storing the final message in the DB.
    """

    def __init__(
        self,
        conversation: Conversation,
        user_id: Optional[int],
        agent: OpenAIAgent,
    ) -> None:
        """
        Initialize the DocumentAgent, which holds references to:
          - The Django Conversation instance
          - A user_id for record ownership
          - The underlying llama_index OpenAIAgent

        Args:
            conversation (Conversation):
                The Conversation record for storing all messages.
            user_id (Optional[int]):
                The PK of the user initiating these messages, or None.
            agent (OpenAIAgent):
                An instance of OpenAIAgent from llama_index, configured with tools, etc.
        """
        self.conversation: Conversation = conversation
        self.user_id: Optional[int] = user_id
        self._agent: OpenAIAgent = agent

    async def astream_chat(
        self, user_query: str
    ) -> Union[StreamingAgentChatResponse, AgentChatResponse]:
        """
        Stores a user query into the DB as a HUMAN message, then invokes the
        underlying OpenAIAgent's astream_chat() method. Returns the streaming or
        non-streaming response object. The caller (Consumer) can then handle
        partial token streaming, final content assembly, etc.

        After streaming completes (or for a non-streaming response), the caller
        can store the final LLM text in DB with store_final_llm_message() below.

        Args:
            user_query (str): The textual content from the user.

        Returns:
            StreamingAgentChatResponse or AgentChatResponse: The result from llama_index.
        """
        # Store user message as "HUMAN"
        await database_sync_to_async(ChatMessage.objects.create)(
            creator_id=self.user_id,
            conversation=self.conversation,
            msg_type="HUMAN",
            content=user_query,
        )

        # Ask llama_index for a streaming or normal chat response
        response = await self._agent.astream_chat(user_query)
        return response

    async def store_final_llm_message(self, final_content: str) -> None:
        """
        Stores or updates an LLM message in the DB after partial token streaming completes.

        Args:
            final_content (str): The complete LLM text after streaming is finished.
        """
        await database_sync_to_async(ChatMessage.objects.create)(
            creator_id=self.user_id,
            conversation=self.conversation,
            msg_type="LLM",
            content=final_content,
        )


class DocumentQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying documents with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages. Streams or returns results back to the client.
    """

    conversation: Optional[Conversation] = None
    agent: Optional[DocumentAgent] = None

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
            if not self.scope["user"].is_authenticated:
                logger.warning("User is not authenticated")
                await self.close(code=4000)
                return

            # Extract a numeric Document ID from path
            graphql_doc_id = extract_document_id(self.scope["path"])
            self.document_id = int(from_global_id(graphql_doc_id)[1])
            logger.debug(f"Extracted document_id: {self.document_id}")

            # Load the Document from DB
            self.document = await Document.objects.aget(id=self.document_id)
            logger.debug(f"Found document: {self.document.title}")

            # Build embedding model
            logger.debug("Setting up embedding model...")
            embed_model = HuggingFaceEmbedding(
                "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
            )
            Settings.embed_model = embed_model

            # Build an OpenAI LLM
            logger.debug("Setting up LLM...")
            llm = OpenAI(
                model=settings.OPENAI_MODEL,
                api_key=settings.OPENAI_API_KEY,
                streaming=True,
            )
            Settings.llm = llm

            # Build a vector store and index
            logger.debug("Setting up vector store...")
            vector_store = DjangoAnnotationVectorStore.from_params(
                document_id=self.document.id
            )
            index = VectorStoreIndex.from_vector_store(
                vector_store=vector_store, use_async=False
            )

            # Create a query engine tool from the index
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
                ),
                load_document_md_summary_tool,
                get_md_summary_token_length_tool,
                get_notes_for_document_corpus_tool,
                get_note_content_token_length_tool,
                get_partial_note_content_tool,
            ]

            # Optionally define a system prompt for the agent
            system_prompt = (
                f"You thoroughly answer requests about the document titled '{self.document.title}' "
                f"(ID: {self.document.id}). Return your answers in thoughtful, attractive markdown. "
                "Avoid repeating instructions or disclaimers."
            )
            prefix_messages = [
                LlamaChatMessage(role="system", content=system_prompt),
            ]

            # Create an internal llama_index OpenAIAgent, passing system prompt as prefix_messages
            logger.debug("Setting up llama_index OpenAIAgent with prefix_messages...")
            underlying_llama_agent = OpenAIAgent.from_tools(
                query_engine_tools,
                verbose=True,
                chat_history=prefix_messages,
            )

            # Create our conversation record
            logger.debug("Creating conversation record...")
            self.conversation = await database_sync_to_async(Conversation.objects.create)(
                creator=self.scope["user"],
                title=f"Document {self.document_id} Conversation",
                chat_with_document=self.document,
            )

            # Initialize our custom DocumentAgent instance
            self.agent = DocumentAgent(
                conversation=self.conversation,
                user_id=self.scope["user"].id if self.scope["user"].is_authenticated else None,
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
        msg_type: Type[MessageType],
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
