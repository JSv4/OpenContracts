"""LlamaIndex-specific agent implementations using our core functionality."""

import logging
from typing import Any, AsyncGenerator, Optional, Union

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
from llama_index.core.tools.function_tool import FunctionTool
from llama_index.llms.openai import OpenAI

from opencontractserver.conversations.models import Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgentBase,
    CoreConversationManager,
    CoreCorpusAgentFactory,
    CoreDocumentAgentFactory,
    CorpusAgentContext,
    DocumentAgentContext,
    SourceNode,
    UnifiedChatResponse,
    UnifiedStreamResponse,
    get_default_config,
)
from opencontractserver.llms.embedders.custom_pipeline_embedding import (
    OpenContractsPipelineEmbedding,
)
from opencontractserver.llms.tools.llama_index_tools import (
    get_md_summary_token_length_tool,
    get_note_content_token_length_tool,
    get_notes_for_document_corpus_tool,
    get_partial_note_content_tool,
    load_document_md_summary_tool,
)
from opencontractserver.llms.vector_stores.llama_index_vector_stores import (
    DjangoAnnotationVectorStore,
)

# Apply nest_asyncio to enable nested event loops
nest_asyncio.apply()

logger = logging.getLogger(__name__)


def _convert_llama_index_node_to_source_node(
    node, similarity_score: float = 1.0
) -> SourceNode:
    """Convert a LlamaIndex source node to a framework-agnostic SourceNode."""
    # Extract annotation_id from metadata if available, otherwise use node id
    metadata = getattr(node, "metadata", {})
    annotation_id = metadata.get("annotation_id", getattr(node, "id_", str(id(node))))

    # Convert annotation_id to int if it's a string representation of an int
    if isinstance(annotation_id, str) and annotation_id.isdigit():
        annotation_id = int(annotation_id)
    elif not isinstance(annotation_id, int):
        # If we can't get a proper annotation_id, use 0 as placeholder
        annotation_id = 0

    return SourceNode(
        annotation_id=annotation_id,
        content=getattr(node, "text", ""),
        metadata=metadata,
        similarity_score=getattr(node, "score", similarity_score),
    )


class LlamaIndexDocumentAgent(CoreAgentBase):
    """LlamaIndex implementation of document agent using core functionality."""

    def __init__(
        self,
        context: DocumentAgentContext,
        config: AgentConfig,
        conversation_manager: CoreConversationManager,
        agent: OpenAIAgent,
    ):
        super().__init__(config, conversation_manager)
        self.context = context
        self._agent = agent
        self._processing_queries = set()

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        corpus: Union[str, int, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[list[FunctionTool]] = None,
        *,
        conversation: Optional[Conversation] = None,
        **kwargs: Any,
    ) -> "LlamaIndexDocumentAgent":
        """Create a LlamaIndex document agent tied to a specific corpus."""

        if config is None:
            config = get_default_config()

        # Provide explicit corpus so the factory can pick the proper embedder
        context = await CoreDocumentAgentFactory.create_context(
            document,
            corpus,
            config,
        )

        # Create conversation manager with basic constructor
        conversation_manager = await CoreConversationManager.create_for_document(
            context.corpus,
            context.document,
            config.user_id,
            config,
            override_conversation=conversation,
        )

        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Set up LlamaIndex-specific components
        embed_model = OpenContractsPipelineEmbedding(
            corpus_id=context.corpus.id,
            embedder_path=config.embedder_path,
        )
        Settings.embed_model = embed_model

        llm = OpenAI(
            model=config.model_name,
            api_key=config.api_key,
            streaming=config.streaming,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
        )
        Settings.llm = llm

        # Create vector store and index
        vector_store = DjangoAnnotationVectorStore.from_params(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            embedder_path=config.embedder_path,
        )
        index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store, use_async=False
        )

        # Create query engine and tools
        doc_engine = index.as_query_engine(
            similarity_top_k=config.similarity_top_k,
            streaming=False,
        )

        description = f"Provides detailed annotations and text from within the '{context.document.title}' document."
        # Start with standard document tools
        current_tools: list[FunctionTool] = [
            QueryEngineTool(
                query_engine=doc_engine,
                metadata=ToolMetadata(
                    name="doc_engine",
                    description=description,
                ),
            ),
            load_document_md_summary_tool,
            get_md_summary_token_length_tool,
            get_notes_for_document_corpus_tool,
            get_note_content_token_length_tool,
            get_partial_note_content_tool,
        ]

        # Add any tools passed from the factory
        if tools:
            current_tools.extend(tools)

        # Convert loaded messages to LlamaIndex format
        prefix_messages = [
            LlamaChatMessage(role="system", content=config.system_prompt)
        ]
        if config.loaded_messages:
            for msg in config.loaded_messages:
                prefix_messages.append(
                    LlamaChatMessage(
                        role=MessageRole.ASSISTANT
                        if msg.msg_type.lower() == "llm"
                        else MessageRole.USER,
                        content=msg.content if isinstance(msg.content, str) else "",
                    )
                )

        # Create OpenAI agent
        underlying_agent = OpenAIAgent.from_tools(
            current_tools,
            verbose=config.verbose,
            chat_history=prefix_messages,
            use_async=True,
        )

        return cls(
            context=context,
            config=config,
            conversation_manager=conversation_manager,
            agent=underlying_agent,
        )

    async def chat(
        self, message: str, store_messages: bool = True
    ) -> UnifiedChatResponse:
        """Send a message and get a complete response."""
        user_msg_id = None
        llm_msg_id = None

        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(
                    message
                )

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message(
                    "LLM"
                )

            # Generate response from LLM (outside transaction to avoid long locks)
            response = await self._agent.astream_chat(message)

            if isinstance(response, StreamingAgentChatResponse):
                # Collect all tokens
                content = ""
                async for token in response.async_response_gen():
                    content += str(token)
            else:
                content = str(response.response)

            # Extract sources from response using proper SourceNode creation
            sources = []
            if hasattr(response, "source_nodes") and response.source_nodes:
                for node in response.source_nodes:
                    sources.append(_convert_llama_index_node_to_source_node(node))

            # Complete the message atomically with content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, content, sources, {"framework": "llama_index"}
                )

            return UnifiedChatResponse(
                content=content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"framework": "llama_index"},
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(
                    llm_msg_id, f"Error: {str(e)}"
                )
            raise

    async def stream(
        self, message: str, store_messages: bool = True
    ) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response."""
        user_msg_id = None
        llm_msg_id = None
        accumulated_content = ""
        sources = []

        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(
                    message
                )

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message(
                    "LLM"
                )

            # Generate streaming response from LLM
            response = await self._agent.astream_chat(message)

            if isinstance(response, StreamingAgentChatResponse):
                # Stream tokens and update message periodically
                token_count = 0
                async for token in response.async_response_gen():
                    token_str = str(token)
                    accumulated_content += token_str
                    token_count += 1

                    yield UnifiedStreamResponse(
                        content=token_str,
                        accumulated_content=accumulated_content,
                        sources=sources,
                        user_message_id=user_msg_id,
                        llm_message_id=llm_msg_id,
                        is_complete=False,
                        metadata={"framework": "llama_index"},
                    )

                    # Update message content every 50 tokens to reduce DB writes
                    if llm_msg_id and token_count % 50 == 0:
                        await self.conversation_manager.update_message_content(
                            llm_msg_id, accumulated_content
                        )

                # Extract sources after streaming is complete
                if hasattr(response, "source_nodes") and response.source_nodes:
                    for node in response.source_nodes:
                        sources.append(_convert_llama_index_node_to_source_node(node))
            else:
                # Non-streaming response
                content = str(response.response)
                accumulated_content = content

                # Extract sources
                if hasattr(response, "source_nodes") and response.source_nodes:
                    for node in response.source_nodes:
                        sources.append(_convert_llama_index_node_to_source_node(node))

                yield UnifiedStreamResponse(
                    content=content,
                    accumulated_content=accumulated_content,
                    sources=sources,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=True,
                    metadata={"framework": "llama_index"},
                )

            # Complete the message atomically with final content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id,
                    accumulated_content,
                    sources,
                    {"framework": "llama_index"},
                )

            # Send final response with sources
            yield UnifiedStreamResponse(
                content="",
                accumulated_content=accumulated_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                is_complete=True,
                metadata={"framework": "llama_index"},
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(
                    llm_msg_id, f"Error: {str(e)}"
                )
            raise

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)

    async def store_llm_message(self, content: str) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(content)

    async def update_message(
        self, message_id: int, content: str, metadata: Optional[dict] = None
    ) -> None:
        """Update an existing message."""
        await self.conversation_manager.update_message(message_id, content, metadata)

    # Legacy compatibility methods
    async def stream_chat(
        self, message: str
    ) -> Union[StreamingAgentChatResponse, AgentChatResponse]:
        """Legacy method for backward compatibility."""
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
        """Legacy method for backward compatibility."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)


class LlamaIndexCorpusAgent(CoreAgentBase):
    """LlamaIndex implementation of corpus agent using core functionality."""

    def __init__(
        self,
        context: CorpusAgentContext,
        config: AgentConfig,
        conversation_manager: CoreConversationManager,
        agent: OpenAIAgent,
    ):
        super().__init__(config, conversation_manager)
        self.context = context
        self._agent = agent
        self._processing_queries = set()

    @classmethod
    async def create(
        cls,
        corpus: Union[str, int, Corpus],
        config: AgentConfig,
        tools: Optional[list[FunctionTool]] = None,
        conversation: Optional[Conversation] = None,  # Add conversation override
    ) -> "LlamaIndexCorpusAgent":

        """Create a LlamaIndex corpus agent using core functionality."""
        context = await CoreCorpusAgentFactory.create_context(corpus, config)

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_corpus(
            context.corpus, config.user_id, config, override_conversation=conversation
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Set up LlamaIndex-specific components
        llm = OpenAI(
            model=config.model_name,
            api_key=config.api_key,
            streaming=config.streaming,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
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
                user_id=None,  # Make sub-document agents anonymous to prevent new conversations
                model_name=config.model_name,
                api_key=config.api_key,
                embedder_path=config.embedder_path,
                similarity_top_k=config.similarity_top_k,
                streaming=False,  # Document agents within corpus shouldn't stream
                verbose=config.verbose,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
            )
            doc_agent = await LlamaIndexDocumentAgent.create(
                doc,
                corpus,
                doc_config,
            )

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

        # Add tools passed from the factory, if any
        if tools:
            query_engine_tools.extend(tools)
        elif (
            not query_engine_tools
        ):  # If no doc-specific tools and no factory tools, add defaults
            query_engine_tools.extend(
                [
                    load_document_md_summary_tool,
                    get_md_summary_token_length_tool,
                    get_notes_for_document_corpus_tool,
                    get_note_content_token_length_tool,
                    get_partial_note_content_tool,
                ]
            )

        # Create object index
        obj_index = ObjectIndex.from_objects(
            query_engine_tools, index_cls=VectorStoreIndex
        )

        # Convert loaded messages to LlamaIndex format
        prefix_messages = [
            LlamaChatMessage(role="system", content=config.system_prompt)
        ]
        if config.loaded_messages:
            for msg in config.loaded_messages:
                prefix_messages.append(
                    LlamaChatMessage(
                        role=MessageRole.ASSISTANT
                        if msg.msg_type.lower() == "llm"
                        else MessageRole.USER,
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

        return cls(
            context=context,
            config=config,
            conversation_manager=conversation_manager,
            agent=aggregator_agent,
        )

    async def chat(
        self, message: str, store_messages: bool = True
    ) -> UnifiedChatResponse:
        """Send a message and get a complete response."""
        user_msg_id = None
        llm_msg_id = None

        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(
                    message
                )

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message(
                    "LLM"
                )

            # Generate response from LLM (outside transaction to avoid long locks)
            response = await self._agent.astream_chat(message)

            if isinstance(response, StreamingAgentChatResponse):
                # Collect all tokens
                content = ""
                async for token in response.async_response_gen():
                    content += str(token)
            else:
                content = str(response.response)

            # Extract sources from response using proper SourceNode creation
            sources = []
            if hasattr(response, "source_nodes") and response.source_nodes:
                for node in response.source_nodes:
                    sources.append(_convert_llama_index_node_to_source_node(node))

            # Complete the message atomically with content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, content, sources, {"framework": "llama_index"}
                )

            return UnifiedChatResponse(
                content=content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"framework": "llama_index"},
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(
                    llm_msg_id, f"Error: {str(e)}"
                )
            raise

    async def stream(
        self, message: str, store_messages: bool = True
    ) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response."""
        user_msg_id = None
        llm_msg_id = None
        accumulated_content = ""
        sources = []

        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(
                    message
                )

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message(
                    "LLM"
                )

            # Generate streaming response from LLM
            response = await self._agent.astream_chat(message)

            if isinstance(response, StreamingAgentChatResponse):
                # Stream tokens and update message periodically
                token_count = 0
                async for token in response.async_response_gen():
                    token_str = str(token)
                    accumulated_content += token_str
                    token_count += 1

                    yield UnifiedStreamResponse(
                        content=token_str,
                        accumulated_content=accumulated_content,
                        sources=sources,
                        user_message_id=user_msg_id,
                        llm_message_id=llm_msg_id,
                        is_complete=False,
                        metadata={"framework": "llama_index"},
                    )

                    # Update message content every 50 tokens to reduce DB writes
                    if llm_msg_id and token_count % 50 == 0:
                        await self.conversation_manager.update_message_content(
                            llm_msg_id, accumulated_content
                        )

                # Extract sources after streaming is complete
                if hasattr(response, "source_nodes") and response.source_nodes:
                    for node in response.source_nodes:
                        sources.append(_convert_llama_index_node_to_source_node(node))
            else:
                # Non-streaming response
                content = str(response.response)
                accumulated_content = content

                # Extract sources
                if hasattr(response, "source_nodes") and response.source_nodes:
                    for node in response.source_nodes:
                        sources.append(_convert_llama_index_node_to_source_node(node))

                yield UnifiedStreamResponse(
                    content=content,
                    accumulated_content=accumulated_content,
                    sources=sources,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=True,
                    metadata={"framework": "llama_index"},
                )

            # Complete the message atomically with final content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id,
                    accumulated_content,
                    sources,
                    {"framework": "llama_index"},
                )

            # Send final response with sources
            yield UnifiedStreamResponse(
                content="",
                accumulated_content=accumulated_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                is_complete=True,
                metadata={"framework": "llama_index"},
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(
                    llm_msg_id, f"Error: {str(e)}"
                )
            raise

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)

    async def store_llm_message(self, content: str) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(content)

    async def update_message(
        self, message_id: int, content: str, metadata: Optional[dict] = None
    ) -> None:
        """Update an existing message."""
        await self.conversation_manager.update_message(message_id, content, metadata)

    # Legacy compatibility methods
    async def stream_chat(
        self, message: str
    ) -> Union[StreamingAgentChatResponse, AgentChatResponse]:
        """Legacy method for backward compatibility."""
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
        """Legacy method for backward compatibility."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)


# Backward compatibility - maintain the original OpenContractDbAgent interface
class OpenContractDbAgent:
    """Backward compatibility wrapper for the original OpenContractDbAgent interface."""

    def __init__(self, agent: CoreAgentBase):
        self._agent = agent
        self.conversation = agent.conversation_manager.conversation
        self.user_id = agent.conversation_manager.user_id

    async def astream_chat(
        self, user_query: str, store_user_message: bool = True
    ) -> Any:
        """Backward compatibility method."""
        return await self._agent.stream_chat(user_query)

    async def store_llm_message(
        self, final_content: str, data: Optional[dict] = None
    ) -> int:
        """Backward compatibility method."""
        return await self._agent.store_message(final_content, "LLM")

    async def update_message(
        self, content: str, message_id: int, data: Optional[dict] = None
    ) -> None:
        """Backward compatibility method."""
        await self._agent.conversation_manager.update_message(message_id, content, data)
