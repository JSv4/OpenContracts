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
from typing import Any, Optional, Type

from graphql_relay import from_global_id

from channels.generic.websocket import AsyncWebsocketConsumer
from llama_index.core.chat_engine.types import StreamingAgentChatResponse

from config.websocket.utils.extract_ids import extract_websocket_path_id
from opencontractserver.llms.agents import (
    MessageType,
    OpenContractDbAgent,
    create_corpus_agent,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.conversations.models import Conversation

logger = logging.getLogger(__name__)


class CorpusQueryConsumer(AsyncWebsocketConsumer):
    """
    A Channels WebSocket consumer for querying corpuses with LLM support.
    Sets up embeddings, an LLM agent, and a conversation record to store
    human and LLM messages. Streams or returns results back to the client.
    """

    conversation: Optional[Conversation] = None
    agent: Optional[OpenContractDbAgent] = None

    async def connect(self) -> None:
        """
        Handles the WebSocket connection event. Attempts to load the associated Corpus,
        sets up the LLM embedding model and query engine, and accepts the connection.

        Raises:
            ValueError: if the path does not contain a valid corpus ID.
            Corpus.DoesNotExist: if no matching Corpus is found.
        """
        logger.debug("WebSocket connection attempt for corpus received.")
        logger.debug(f"Connection scope: {self.scope}")

        try:
            if not self.scope["user"].is_authenticated:
                logger.warning("User is not authenticated.")
                await self.close(code=4000)
                return

            # Extract a numeric Corpus ID from path
            graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
            print(f"Websocket GraphQL corpus ID: {graphql_corpus_id}")
            self.corpus_id = from_global_id(graphql_corpus_id)[1]
            logger.debug(f"Extracted corpus_id: {self.corpus_id}")

            # Load the Corpus from DB
            self.corpus = await Corpus.objects.aget(
                id=self.corpus_id
            )
            logger.debug(f"Found corpus: {self.corpus.title}")

            # Create our conversation record
            logger.debug("Creating conversation record...")
            self.conversation = await Conversation.objects.acreate(
                creator=self.scope["user"],
                title=f"Corpus {self.corpus_id} Conversation",
                chat_with_corpus=self.corpus,
            )

            # Initialize our custom Agent instance for corpuses
            underlying_llama_agent = await create_corpus_agent(
                corpus_id=self.corpus.id,
                user_id=self.scope["user"].id,
            )
            self.agent = OpenContractDbAgent(
                conversation=self.conversation,
                user_id=self.scope["user"].id
                if self.scope["user"].is_authenticated
                else None,
                agent=underlying_llama_agent,
            )

            logger.debug("Accepting WebSocket connection (corpus).")
            await self.accept()
            logger.debug("WebSocket connection accepted (corpus).")

        except ValueError as v_err:
            logger.error(f"Invalid corpus path: {v_err}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Invalid corpus path: {v_err}"},
            )
            await self.close(code=4000)
        except Corpus.DoesNotExist:
            logger.error(f"Corpus not found: {getattr(self, 'corpus_id', 'Unknown')}")
            await self.accept()
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": "Requested Corpus not found."},
            )
            await self.close(code=4000)
        except Exception as e:
            logger.error(f"Error during corpus connection: {str(e)}", exc_info=True)
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
        logger.debug(f"Corpus WebSocket disconnected with code: {close_code}")
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
            f"Sending corpus message - Type: {msg_type}, Content length: {len(content)}"
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
        logger.debug(f"Corpus WebSocket received message: {text_data}")

        try:
            text_data_json: dict[str, Any] = json.loads(text_data)
            user_query: str = text_data_json.get("query", "").strip()

            if not user_query:
                logger.warning("Empty query received (corpus).")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content="No query provided.",
                )
                return

            # Notify the client that asynchronous content streaming is about to start
            logger.debug("Sending ASYNC_START (corpus) to client")
            await self.send_standard_message(
                msg_type="ASYNC_START",
                content="Starting asynchronous corpus content streaming...",
            )

            # The agent will store the user message in DB,
            # then return a streaming or normal response object
            logger.debug("Calling CorpusAgent to handle user message asynchronously")
            response = await self.agent.astream_chat(user_query)

            # Check whether we have a streaming response
            if isinstance(response, StreamingAgentChatResponse):
                logger.debug("Processing streaming response from the corpus agent")
                llm_response_buffer = ""

                async for token in response.async_response_gen():
                    logger.debug(f"Emitting partial corpus token: {token}")
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
                    logger.info(f"Sources: {sources_str}")

                # Store final LLM message in DB
                logger.debug("Storing final LLM message for corpus conversation in DB")
                await self.agent.store_final_llm_message(llm_response_buffer)

                logger.debug("Sending ASYNC_FINISH (corpus) message")
                await self.send_standard_message(
                    msg_type="ASYNC_FINISH",
                    content=llm_response_buffer,
                    data={"sources": sources_str},
                )
            else:
                # Non-streaming response
                logger.debug("Processing NON-streaming response from the corpus agent")
                final_text: str = getattr(response, "response", "")
                sources_str = ""
                # If there's a mechanism to get source information from non-streaming responses
                if hasattr(response, "source_nodes") and response.source_nodes:
                    # You could adapt how sources are formatted here
                    sources_str = json.dumps(
                        [sn.model_extra for sn in response.source_nodes],
                        indent=4,
                    )

                # Store final text
                logger.debug("Storing final LLM message for corpus conversation in DB")
                await self.agent.store_final_llm_message(final_text)

                logger.debug("Sending SYNC_CONTENT (corpus) message")
                await self.send_standard_message(
                    msg_type="SYNC_CONTENT",
                    content=final_text,
                    data={"sources": sources_str},
                )

        except Exception as e:
            logger.error(f"Error during corpus message processing: {e}", exc_info=True)
            await self.send_standard_message(
                msg_type="SYNC_CONTENT",
                content="",
                data={"error": f"Error during message processing: {e}"},
            )