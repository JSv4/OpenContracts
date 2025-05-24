"""LlamaIndex-specific agent implementations using our core functionality."""

import logging
from typing import Any, Optional, Union

import nest_asyncio
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
from llama_index.llms.openai import OpenAI

from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgent,
    CoreConversationManager,
    CoreCorpusAgentFactory,
    CoreDocumentAgentFactory,
    DocumentAgentContext,
    CorpusAgentContext,
)
from opencontractserver.llms.embeddings.custom_pipeline_embedding import OpenContractsPipelineEmbedding
from opencontractserver.llms.tools.core_tools import (
    get_md_summary_token_length,
    get_note_content_token_length_tool,
    get_notes_for_document_corpus_tool,
    get_partial_note_content_tool,
    load_document_md_summary_tool,
)
from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore

# Apply nest_asyncio to enable nested event loops
nest_asyncio.apply()

logger = logging.getLogger(__name__)


class LlamaIndexDocumentAgent(CoreAgent):
    """LlamaIndex implementation of document agent using core functionality."""

    def __init__(
        self,
        context: DocumentAgentContext,
        conversation_manager: CoreConversationManager,
        agent: OpenAIAgent,
    ):
        self.context = context
        self.conversation_manager = conversation_manager
        self._agent = agent
        self._processing_queries = set()

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        config: AgentConfig,
    ) -> "LlamaIndexDocumentAgent":
        """Create a LlamaIndex document agent using core functionality."""
        # Create context using core factory
        context = await CoreDocumentAgentFactory.create_context(document, config)

        # Create conversation manager
        conversation_manager = await CoreConversationManager.create_for_document(
            context.document,
            config.user_id,
            config.conversation,
        )

        # Set up LlamaIndex-specific components
        embed_model = OpenContractsPipelineEmbedding(embedder_path=config.embedder_path)
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=config.model_name,
            api_key=config.api_key,
            streaming=config.streaming,
        )
        Settings.llm = llm

        # Create vector store and index
        vector_store = DjangoAnnotationVectorStore.from_params(
            user_id=config.user_id,
            document_id=context.document.id,
            embedder_path=config.embedder_path,
        )
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store, use_async=False)

        # Create query engine and tools
        doc_engine = index.as_query_engine(
            similarity_top_k=config.similarity_top_k,
            streaming=False,
        )

        query_engine_tools = [
            QueryEngineTool(
                query_engine=doc_engine,
                metadata=ToolMetadata(
                    name="doc_engine",
                    description=f"Provides detailed annotations and text from within the '{context.document.title}' document.",
                ),
            ),
            load_document_md_summary_tool,
            get_md_summary_token_length_tool,
            get_notes_for_document_corpus_tool,
            get_note_content_token_length_tool,
            get_partial_note_content_tool,
        ]

        # Convert loaded messages to LlamaIndex format
        prefix_messages = [LlamaChatMessage(role="system", content=config.system_prompt)]
        if config.loaded_messages:
            for msg in config.loaded_messages:
                prefix_messages.append(
                    LlamaChatMessage(
                        role=MessageRole.ASSISTANT if msg.msg_type.lower() == "llm" else MessageRole.USER,
                        content=msg.content if isinstance(msg.content, str) else "",
                    )
                )

        # Create OpenAI agent
        underlying_agent = OpenAIAgent.from_tools(
            query_engine_tools,
            verbose=config.verbose,
            chat_history=prefix_messages,
            use_async=True,
        )

        return cls(context, conversation_manager, underlying_agent)

    async def chat(self, message: str) -> str:
        """Send a message and get a complete response."""
        response = await self.stream_chat(message)
        if isinstance(response, StreamingAgentChatResponse):
            # Collect all tokens
            content = ""
            async for token in response.async_response_gen():
                content += str(token)
            return content
        else:
            return str(response.response)

    async def stream_chat(self, message: str) -> Union[StreamingAgentChatResponse, AgentChatResponse]:
        """Send a message and get a streaming response."""
        if message in self._processing_queries:
            return await self._agent.astream_chat(message)

        self._processing_queries.add(message)

        # Store user message
        await self.conversation_manager.store_user_message(message)

        try:
            response = await self._agent.astream_chat(message)
            return response
        finally:
            self._processing_queries.remove(message)

    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Store a message in the conversation."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)


class LlamaIndexCorpusAgent(CoreAgent):
    """LlamaIndex implementation of corpus agent using core functionality."""

    def __init__(
        self,
        context: CorpusAgentContext,
        conversation_manager: CoreConversationManager,
        agent: OpenAIAgent,
    ):
        self.context = context
        self.conversation_manager = conversation_manager
        self._agent = agent
        self._processing_queries = set()

    @classmethod
    async def create(
        cls,
        corpus_id: Union[str, int],
        config: AgentConfig,
    ) -> "LlamaIndexCorpusAgent":
        """Create a LlamaIndex corpus agent using core functionality."""
        # Create context using core factory
        context = await CoreCorpusAgentFactory.create_context(corpus_id, config)

        # Create conversation manager
        conversation_manager = await CoreConversationManager.create_for_corpus(
            context.corpus,
            config.user_id,
            config.conversation,
        )

        # Set up LlamaIndex-specific components
        llm = OpenAI(
            model=config.model_name,
            api_key=config.api_key,
            streaming=config.streaming,
        )
        Settings.llm = llm

        embed_model = OpenContractsPipelineEmbedding(
            corpus_id=context.corpus.id,
            embedder_path=config.embedder_path,
        )
        Settings.embed_model = embed_model

        # Create document agents and tools
        query_engine_tools = []
        for doc in context.documents:
            # Create document agent context
            doc_config = AgentConfig(
                user_id=config.user_id,
                model_name=config.model_name,
                api_key=config.api_key,
                embedder_path=config.embedder_path,
                similarity_top_k=config.similarity_top_k,
                streaming=False,  # Document agents within corpus shouldn't stream
                verbose=config.verbose,
            )
            doc_agent = await LlamaIndexDocumentAgent.create(doc, doc_config)

            tool_name = f"doc_{doc.id}"
            doc_summary = (
                f"This tool provides information about the document titled '{doc.title}'. "
                f"Description: {doc.description[:200]}... "
                f"Use this tool when you need information from this specific document."
            )

            doc_tool = QueryEngineTool(
                query_engine=doc_agent._agent,
                metadata=ToolMetadata(name=tool_name, description=doc_summary),
            )
            query_engine_tools.append(doc_tool)

        # Add additional tools
        query_engine_tools.extend([
            load_document_md_summary_tool,
            get_md_summary_token_length_tool,
            get_notes_for_document_corpus_tool,
            get_note_content_token_length_tool,
            get_partial_note_content_tool,
        ])

        # Create object index
        obj_index = ObjectIndex.from_objects(query_engine_tools, index_cls=VectorStoreIndex)

        # Convert loaded messages to LlamaIndex format
        prefix_messages = [LlamaChatMessage(role="system", content=config.system_prompt)]
        if config.loaded_messages:
            for msg in config.loaded_messages:
                prefix_messages.append(
                    LlamaChatMessage(
                        role=MessageRole.ASSISTANT if msg.msg_type.lower() == "llm" else MessageRole.USER,
                        content=msg.content if isinstance(msg.content, str) else "",
                    )
                )

        # Create aggregator agent
        aggregator_agent = OpenAIAgent.from_tools(
            tool_retriever=obj_index.as_retriever(similarity_top_k=3),
            system_prompt=config.system_prompt,
            verbose=config.verbose,
            chat_history=prefix_messages,
        )

        return cls(context, conversation_manager, aggregator_agent)

    async def chat(self, message: str) -> str:
        """Send a message and get a complete response."""
        response = await self.stream_chat(message)
        if isinstance(response, StreamingAgentChatResponse):
            # Collect all tokens
            content = ""
            async for token in response.async_response_gen():
                content += str(token)
            return content
        else:
            return str(response.response)

    async def stream_chat(self, message: str) -> Union[StreamingAgentChatResponse, AgentChatResponse]:
        """Send a message and get a streaming response."""
        if message in self._processing_queries:
            return await self._agent.astream_chat(message)

        self._processing_queries.add(message)

        # Store user message
        await self.conversation_manager.store_user_message(message)

        try:
            response = await self._agent.astream_chat(message)
            return response
        finally:
            self._processing_queries.remove(message)

    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Store a message in the conversation."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)


# Backward compatibility - maintain the original OpenContractDbAgent interface
class OpenContractDbAgent:
    """Backward compatibility wrapper for the original OpenContractDbAgent interface."""

    def __init__(self, agent: CoreAgent):
        self._agent = agent
        self.conversation = agent.conversation_manager.conversation
        self.user_id = agent.conversation_manager.user_id

    async def astream_chat(self, user_query: str, store_user_message: bool = True) -> Any:
        """Backward compatibility method."""
        return await self._agent.stream_chat(user_query)

    async def store_llm_message(self, final_content: str, data: Optional[dict] = None) -> int:
        """Backward compatibility method."""
        return await self._agent.store_message(final_content, "LLM")

    async def update_message(self, content: str, message_id: int, data: Optional[dict] = None) -> None:
        """Backward compatibility method."""
        await self._agent.conversation_manager.update_message(message_id, content, data)
