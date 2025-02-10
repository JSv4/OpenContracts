from __future__ import annotations

import logging
from typing import Literal

from channels.db import database_sync_to_async
from django.conf import settings
from llama_index.agent.openai import OpenAIAgent
from llama_index.core import Settings, VectorStoreIndex
from llama_index.core.base.llms.types import ChatMessage as LlamaChatMessage
from llama_index.core.chat_engine.types import (
    AgentChatResponse,
    StreamingAgentChatResponse,
)
from llama_index.core.objects import ObjectIndex
from llama_index.core.tools import QueryEngineTool, ToolMetadata
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.openai import OpenAI

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools import (
    get_md_summary_token_length_tool,
    get_note_content_token_length_tool,
    get_notes_for_document_corpus_tool,
    get_partial_note_content_tool,
    load_document_md_summary_tool,
)
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

logger = logging.getLogger(__name__)

MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


class OpenContractDbAgent:
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
        user_id: int | None,
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
        self.user_id: int | None = user_id
        self._agent: OpenAIAgent = agent

    async def astream_chat(
        self, user_query: str
    ) -> StreamingAgentChatResponse | AgentChatResponse:
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


"""Factory function to construct an OpenContractDbAgent for a given Document."""


async def create_document_agent(
    document: str | int | Document,
    user_id: int | None = None,
    loaded_messages: list | None = None,
):
    """
    Creates a document agent for processing queries, with an optional prefix of conversation messages.

    Args:
        document (str | int | Document): The document identifier or instance.
        user_id (int | None): The ID of the user.
        prefix_messages (list, optional): A list of ChatMessage instances to preload
            conversation context.

    Returns:
        OpenContractDbAgent: An instance of OpenContractDbAgent configured with the
            given document and conversation context.
    """
    if not isinstance(document, Document):
        document = await Document.objects.aget(id=document)

    logger.debug("Creating embedding model...")
    embed_model = HuggingFaceEmbedding(
        "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
    )
    Settings.embed_model = embed_model

    logger.debug("Creating OpenAI LLM...")
    llm = OpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        streaming=True,
    )
    Settings.llm = llm

    logger.debug("Building vector store and index...")
    vector_store = DjangoAnnotationVectorStore.from_params(document_id=document.id)
    index = VectorStoreIndex.from_vector_store(
        vector_store=vector_store,
        use_async=False,
    )

    logger.debug("Creating query engine tool...")
    doc_engine = index.as_query_engine(similarity_top_k=10, streaming=False)

    logger.debug("Initializing query engine tools...")
    query_engine_tools = [
        QueryEngineTool(
            query_engine=doc_engine,
            metadata=ToolMetadata(
                name="doc_engine",
                description=(
                    f"Provides detailed annotations and text from within the '{document.title}' document."
                ),
            ),
        ),
        load_document_md_summary_tool,
        get_md_summary_token_length_tool,
        get_notes_for_document_corpus_tool,
        get_note_content_token_length_tool,
        get_partial_note_content_tool,
    ]

    system_prompt = (
        f"You thoroughly answer requests about the document titled '{document.title}' "
        f"(ID: {document.id}). This document is described as:\n\n`{document.description}`\n\n"
        "Return your answers in thoughtful, attractive markdown. "
        "Avoid repeating instructions, writing down your thought processes (unless asked), or giving disclaimers."
    )

    prefix_messages = [LlamaChatMessage(role="system", content=system_prompt)]

    # Safely convert list of ChatMessage objects to list of LlamaChatMessage
    if loaded_messages:
        for msg in loaded_messages:
            print(f"Message type {type(msg)}: {dir(msg)}")
            prefix_messages.append(
                LlamaChatMessage(role=msg.msg_type.lower(), content=msg.content)
            )

    logger.debug("Creating the underlying llama_index OpenAIAgent...")
    underlying_llama_agent = OpenAIAgent.from_tools(
        query_engine_tools,
        verbose=True,
        chat_history=prefix_messages,
    )

    logger.debug("Creating Conversation record...")
    conversation = await database_sync_to_async(Conversation.objects.create)(
        creator_id=user_id,
        title=f"Document {document.id} Conversation",
        chat_with_document=document,
    )

    logger.debug("Wrapping with OpenContractDbAgent...")
    agent = OpenContractDbAgent(
        conversation=conversation,
        user_id=user_id,
        agent=underlying_llama_agent,
    )

    logger.debug("Returning configured OpenContractDbAgent.")
    return agent


async def create_corpus_agent(
    corpus_id: str | int,
    user_id: int | None = None,
) -> OpenContractDbAgent:
    """
    Factory function to create an OpenContractDbAgent for a given Corpus.

    This function:
      1) Builds a list of per-document LlamaIndex/OpenAI agents for each Document in the Corpus.
      2) Combines these per-document agents into a "top-level" aggregator agent.
         This is done by passing them as "tools" to an OpenAIAgent that can route a user query
         to the appropriate document agent(s).
      3) Stores the entire conversation in the DB as a single *Corpus-level* conversation. All
         user queries and final aggregator answers will be saved under one Conversation record
         (linked to the Corpus).

    Args:
        corpus_id (str | int):
            The numeric or string ID of the Corpus for which to build the multi-document agent.
        user_id (Optional[int]):
            The user ID to associate with record ownership and messages in the
            conversation table.

    Returns:
        OpenContractDbAgent:
            An instance of OpenContractDbAgent configured to query the entire Corpus.
    """

    # Build a top-level aggregator agent that can route a user's query to the right document
    # Using a "RetrieverOpenAIAgent" to do basic retrieval of the tool relevant to the question.
    logger.debug("Creating llm for corpus-level orchestration...")
    llm = OpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        streaming=True,
    )
    Settings.llm = llm

    logger.debug("Creating embedding model...")
    embed_model = HuggingFaceEmbedding(
        "/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
    )
    Settings.embed_model = embed_model

    # Fetch the corpus from DB
    corpus = await Corpus.objects.aget(id=corpus_id)
    logger.debug(f"Fetched corpus for multi-agent creation: {corpus.title}")

    # Fetch all associated documents
    # Build a sub-agent (OpenAIAgent) for each document
    doc_agents = []
    async for doc in corpus.documents.all():
        logger.debug(f"Building per-document agent for: {doc.title} (ID: {doc.id})")
        doc_agents.append(await create_document_agent(doc, user_id))

    # Build an object index over all doc_tools
    logger.debug("Building ObjectIndex over all single-doc agent tools...")
    obj_index = ObjectIndex.from_objects(doc_agents, index_cls=VectorStoreIndex)

    aggregator_system_prompt = (
        f"You are an agent designed to answer queries about the documents in corpus '{corpus.title}'. "
        "Please always use the provided tools (each corresponding to a document) to answer questions. "
        "Do not rely on prior knowledge."
    )

    # One way is to use a RetrieverOpenAIAgent that automatically picks the relevant doc agent's tool
    # via the object index as a retriever. Or we can do a normal "OpenAIAgent" with all tools.
    # We show a retriever-based approach here:
    aggregator_agent = OpenAIAgent.from_tools(
        tool_retriever=obj_index.as_retriever(similarity_top_k=3),
        system_prompt=aggregator_system_prompt,
        verbose=True,
    )

    return aggregator_agent
