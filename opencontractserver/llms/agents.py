from __future__ import annotations

import logging
from typing import Literal

from django.conf import settings
from llama_cloud import MessageRole
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
    A wrapper around the llama_index OpenAIAgent that handles:
      1) Loading or creating a Conversation record
      2) Storing user and LLM messages to the DB
      3) Preventing duplicate message processing

    Because partial-token streaming is best handled at the Consumer (to stream
    tokens to the client), we allow the DocumentQueryConsumer to manage the
    generator tokens. This agent's async method returns a StreamingAgentChatResponse
    or an AgentChatResponse, which the consumer can iterate over to handle partial
    streaming and storing the final message in the DB.
    """

    _processing_queries = set()  # Class variable to track all processing queries
    _instance_counter = 0  # Class variable to generate unique IDs

    def __init__(
        self,
        conversation: Conversation,
        user_id: int | None,
        agent: OpenAIAgent,
    ) -> None:
        """
        Initialize the DocumentAgent with conversation tracking and user attribution.

        Args:
            conversation: The Conversation record for storing all messages.
            user_id: Optional user ID for message attribution.
            agent: An instance of OpenAIAgent from llama_index, configured with tools.
        """
        self.conversation = conversation
        self.user_id = user_id
        self._agent = agent

    async def astream_chat(
        self, user_query: str, store_user_message: bool = True
    ) -> StreamingAgentChatResponse | AgentChatResponse:
        """
        Stores a user query into the DB as a HUMAN message, then invokes the
        underlying OpenAIAgent's astream_chat() method.

        Uses a class-level lock to prevent duplicate processing of identical queries.

        Args:
            user_query: The text query from the user.

        Returns:
            Either a StreamingAgentChatResponse for token-by-token streaming,
            or an AgentChatResponse for complete responses.
        """
        if user_query in OpenContractDbAgent._processing_queries:
            return await self._agent.astream_chat(user_query)

        OpenContractDbAgent._processing_queries.add(user_query)

        if store_user_message:
            await ChatMessage.objects.acreate(
                creator_id=self.user_id,
                conversation=self.conversation,
                msg_type="HUMAN",
                content=user_query,
            )

        try:
            response = await self._agent.astream_chat(user_query)
            return response
        finally:
            OpenContractDbAgent._processing_queries.remove(user_query)

    async def store_llm_message(
        self, final_content: str, data: dict | None = None
    ) -> str | int:
        """
        Stores or updates an LLM message in the DB after partial token streaming completes.

        Args:
            final_content (str): The complete LLM text after streaming is finished.
        """
        message = await ChatMessage.objects.acreate(
            creator_id=self.user_id,
            conversation=self.conversation,
            msg_type="LLM",
            content=final_content,
            data=data,
        )
        return message.id

    async def update_message(
        self, content: str, message_id: int, data: dict | None = None
    ) -> None:
        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content
        message.data = data
        await message.asave()


"""Factory function to construct an OpenContractDbAgent for a given Document."""


async def create_document_agent(
    document: str | int | Document,
    user_id: int | None = None,
    override_conversation: Conversation | None = None,
    override_system_prompt: str | None = None,
    loaded_messages: list[ChatMessage] | None = None,
) -> OpenContractDbAgent:
    """
    Factory function to construct an OpenContractDbAgent for a given Document.
    Sets up embeddings, vector store, and query tools for document interaction.

    Args:
        document: Either a Document instance or its ID.
        user_id: Optional user ID for message attribution and permission checks.
        override_conversation: Optional existing Conversation to use instead of creating new.
        override_system_prompt: Optional custom system prompt to override default.
        loaded_messages: Optional list of existing messages to initialize chat history.

    Returns:
        OpenContractDbAgent: Configured agent ready for document interaction.
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
    vector_store = DjangoAnnotationVectorStore.from_params(
        user_id=user_id, document_id=document.id
    )
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

    if override_system_prompt:
        system_prompt = override_system_prompt

    prefix_messages = [LlamaChatMessage(role="system", content=system_prompt)]

    if loaded_messages:
        for msg in loaded_messages:
            prefix_messages.append(
                LlamaChatMessage(
                    role=MessageRole.ASSISTANT
                    if msg.msg_type.lower() == "llm"
                    else MessageRole.USER,
                    content=msg.content,
                )
            )

    logger.debug("Creating OpenAIAgent...")
    underlying_llama_agent = OpenAIAgent.from_tools(
        query_engine_tools,
        verbose=True,
        chat_history=prefix_messages,
    )

    logger.debug("Creating Conversation record...")
    if override_conversation:
        conversation = override_conversation
    else:
        conversation = await Conversation.objects.acreate(
            creator_id=user_id,
            title=f"Document {document.id} Conversation",
            chat_with_document=document,
        )

    return OpenContractDbAgent(
        conversation=conversation,
        user_id=user_id,
        agent=underlying_llama_agent,
    )


async def create_corpus_agent(
    corpus_id: str | int,
    user_id: int | None = None,
) -> OpenContractDbAgent:
    """
    Factory function to create an OpenContractDbAgent for a given Corpus.
    Creates individual document agents and combines them into a corpus-level agent.

    Args:
        corpus_id: ID of the Corpus to create an agent for.
        user_id: Optional user ID for message attribution and permission checks.

    Returns:
        OpenContractDbAgent: Agent configured to handle queries across all corpus documents.
    """
    logger.debug(f"Creating corpus agent for corpus {corpus_id}")

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

    corpus = await Corpus.objects.aget(id=corpus_id)
    logger.debug(f"Fetched corpus: {corpus.title}")

    doc_agents = []
    async for doc in corpus.documents.all():
        logger.debug(f"Building agent for document: {doc.title}")
        doc_agents.append(await create_document_agent(doc, user_id))

    logger.debug("Building ObjectIndex over document agents...")
    obj_index = ObjectIndex.from_objects(doc_agents, index_cls=VectorStoreIndex)

    aggregator_system_prompt = (
        f"You are an agent designed to answer queries about the documents in corpus '{corpus.title}'. "
        "Please always use the provided tools (each corresponding to a document) to answer questions. "
        "Do not rely on prior knowledge."
    )

    aggregator_agent = OpenAIAgent.from_tools(
        tool_retriever=obj_index.as_retriever(similarity_top_k=3),
        system_prompt=aggregator_system_prompt,
        verbose=True,
    )

    return aggregator_agent
