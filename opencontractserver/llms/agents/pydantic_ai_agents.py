"""Pydantic AI-specific agent implementations following modern patterns."""

import logging
from typing import Any, Optional, Union, List, AsyncGenerator
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgent,
    CoreConversationManager,
    CoreCorpusAgentFactory,
    CoreDocumentAgentFactory,
    DocumentAgentContext,
    CorpusAgentContext,
    UnifiedChatResponse,
    UnifiedStreamResponse,
    SourceNode,
)
from opencontractserver.llms.tools.pydantic_ai_tools import PydanticAIToolWrapper

logger = logging.getLogger(__name__)


class PydanticAIAgentConfig(BaseModel):
    """Pydantic AI specific agent configuration."""
    
    model_name: str = Field(default="gpt-4o-mini", description="LLM model to use")
    system_prompt: Optional[str] = Field(default=None, description="System prompt for the agent")
    temperature: float = Field(default=0.7, description="Temperature for response generation")
    max_tokens: Optional[int] = Field(default=None, description="Maximum tokens in response")
    streaming: bool = Field(default=True, description="Enable streaming responses")
    tools: List[PydanticAIToolWrapper] = Field(default_factory=list, description="Available tools")
    
    class Config:
        arbitrary_types_allowed = True


@dataclass
class PydanticAIAgentState:
    """State management for Pydantic AI agents."""
    
    conversation_id: Optional[str] = None
    last_message_id: Optional[int] = None
    processing_queries: set = None
    
    def __post_init__(self):
        if self.processing_queries is None:
            self.processing_queries = set()


class PydanticAIDocumentAgent(CoreAgent):
    """Modern Pydantic AI implementation of document agent."""

    def __init__(
        self,
        context: DocumentAgentContext,
        conversation_manager: CoreConversationManager,
        config: PydanticAIAgentConfig,
        state: Optional[PydanticAIAgentState] = None,
    ):
        """Initialize the Pydantic AI document agent.
        
        Args:
            context: Document agent context
            conversation_manager: Conversation manager
            config: Pydantic AI specific configuration
            state: Optional agent state
        """
        self.context = context
        self.conversation_manager = conversation_manager
        self.config = config
        self.state = state or PydanticAIAgentState()
        
        # TODO: Initialize actual Pydantic AI agent when available
        # self._agent = self._create_pydantic_ai_agent()

    def _create_pydantic_ai_agent(self):
        """Create the underlying Pydantic AI agent.
        
        This will be implemented when Pydantic AI is fully integrated.
        """
        # TODO: Implement actual Pydantic AI agent creation
        # Example structure:
        # from pydantic_ai import Agent
        # 
        # return Agent(
        #     model=self.config.model_name,
        #     system_prompt=self.config.system_prompt,
        #     tools=[tool.function for tool in self.config.tools],
        #     temperature=self.config.temperature,
        #     max_tokens=self.config.max_tokens,
        # )
        pass

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        config: AgentConfig,
        tools: Optional[List[PydanticAIToolWrapper]] = None,
    ) -> "PydanticAIDocumentAgent":
        """Create a modern Pydantic AI document agent.
        
        Args:
            document: Document to create agent for
            config: Base agent configuration
            tools: Optional list of Pydantic AI tools
            
        Returns:
            PydanticAIDocumentAgent instance
        """
        # Create document context using core factories
        context = await CoreDocumentAgentFactory.create_context(document, config)
        
        # Create conversation manager
        conversation_manager = await CoreConversationManager.create_for_document(
            context.document, 
            config.user_id, 
            config
        )
        
        # Convert base config to Pydantic AI config
        pydantic_config = PydanticAIAgentConfig(
            model_name=config.model_name,
            system_prompt=config.system_prompt,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            streaming=config.streaming,
            tools=tools or [],
        )
        
        # Create and return agent
        return cls(context, conversation_manager, pydantic_config)

    async def chat(self, message: str, store_messages: bool = True) -> UnifiedChatResponse:
        """Send a message and get a response using modern Pydantic AI patterns.
        
        Args:
            message: User message
            store_messages: Whether to store messages in conversation
            
        Returns:
            Unified chat response
        """
        user_msg_id = None
        llm_msg_id = None
        
        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(message)

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message("LLM")

            # TODO: Implement when Pydantic AI is integrated
            # response = await self._agent.run(message)
            # For now, return a placeholder response
            content = f"[PydanticAI Placeholder] Response to: {message}"
            
            # Extract sources (placeholder for now)
            sources = [
                SourceNode(
                    annotation_id=0,
                    content="This is a placeholder source from PydanticAI agent",
                    metadata={"document_id": self.context.document.id},
                    similarity_score=0.95
                )
            ]

            # Complete the message atomically with content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, 
                    content, 
                    sources, 
                    {"framework": "pydantic_ai", "document_id": self.context.document.id}
                )

            return UnifiedChatResponse(
                content=content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"framework": "pydantic_ai", "document_id": self.context.document.id}
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(llm_msg_id, f"Error: {str(e)}")
            raise

    async def stream(self, message: str, store_messages: bool = True) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response using modern patterns.
        
        Args:
            message: User message
            store_messages: Whether to store messages in conversation
            
        Yields:
            Unified stream response chunks
        """
        user_msg_id = None
        llm_msg_id = None
        accumulated_content = ""
        sources = []
        
        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(message)

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message("LLM")

            # TODO: Implement when Pydantic AI is integrated
            # async for chunk in self._agent.run_stream(message):
            #     accumulated_content += chunk
            #     yield UnifiedStreamResponse(
            #         content=chunk,
            #         accumulated_content=accumulated_content,
            #         sources=sources,
            #         user_message_id=user_msg_id,
            #         llm_message_id=llm_msg_id,
            #         is_complete=False,
            #         metadata={"framework": "pydantic_ai"}
            #     )
            
            # For now, simulate streaming with placeholder content
            placeholder_response = f"[PydanticAI Streaming] Response to: {message}"
            words = placeholder_response.split()
            
            for i, word in enumerate(words):
                chunk = word + " " if i < len(words) - 1 else word
                accumulated_content += chunk
                
                yield UnifiedStreamResponse(
                    content=chunk,
                    accumulated_content=accumulated_content,
                    sources=sources,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=False,
                    metadata={"framework": "pydantic_ai", "document_id": self.context.document.id}
                )

            # Add sources after streaming is complete
            sources = [
                SourceNode(
                    annotation_id=0,
                    content="This is a placeholder source from PydanticAI agent",
                    metadata={"document_id": self.context.document.id},
                    similarity_score=0.95
                )
            ]

            # Complete the message atomically with final content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, 
                    accumulated_content, 
                    sources, 
                    {"framework": "pydantic_ai", "document_id": self.context.document.id}
                )

            # Send final response with sources
            yield UnifiedStreamResponse(
                content="",
                accumulated_content=accumulated_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                is_complete=True,
                metadata={"framework": "pydantic_ai", "document_id": self.context.document.id}
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(llm_msg_id, f"Error: {str(e)}")
            raise

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)

    async def store_llm_message(self, content: str) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(content)

    async def update_message(self, message_id: int, content: str, metadata: Optional[dict] = None) -> None:
        """Update an existing message."""
        await self.conversation_manager.update_message(message_id, content, metadata)

    # Legacy compatibility methods
    async def stream_chat(self, message: str) -> AsyncGenerator[str, None]:
        """Legacy method for backward compatibility."""
        async for response in self.stream(message):
            if response.content:
                yield response.content

    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Legacy method for backward compatibility."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)

    async def get_conversation_history(self) -> List[dict]:
        """Get conversation history in Pydantic AI format.
        
        Returns:
            List of message dictionaries
        """
        # TODO: Implement conversation history retrieval
        # messages = await self.conversation_manager.get_messages()
        # return [
        #     {
        #         "role": "user" if msg.msg_type == "USER" else "assistant",
        #         "content": msg.content,
        #         "timestamp": msg.created.isoformat(),
        #     }
        #     for msg in messages
        # ]
        return []

    def add_tool(self, tool: PydanticAIToolWrapper) -> None:
        """Add a tool to the agent.
        
        Args:
            tool: Pydantic AI tool wrapper
        """
        self.config.tools.append(tool)
        # TODO: Update the underlying Pydantic AI agent with new tool

    def remove_tool(self, tool_name: str) -> bool:
        """Remove a tool from the agent.
        
        Args:
            tool_name: Name of tool to remove
            
        Returns:
            True if tool was removed, False if not found
        """
        for i, tool in enumerate(self.config.tools):
            if tool.name == tool_name:
                del self.config.tools[i]
                # TODO: Update the underlying Pydantic AI agent
                return True
        return False


class PydanticAICorpusAgent(CoreAgent):
    """Modern Pydantic AI implementation of corpus agent."""

    def __init__(
        self,
        context: CorpusAgentContext,
        conversation_manager: CoreConversationManager,
        config: PydanticAIAgentConfig,
        state: Optional[PydanticAIAgentState] = None,
    ):
        """Initialize the Pydantic AI corpus agent.
        
        Args:
            context: Corpus agent context
            conversation_manager: Conversation manager
            config: Pydantic AI specific configuration
            state: Optional agent state
        """
        self.context = context
        self.conversation_manager = conversation_manager
        self.config = config
        self.state = state or PydanticAIAgentState()
        
        # TODO: Initialize actual Pydantic AI agent when available
        # self._agent = self._create_pydantic_ai_agent()

    @classmethod
    async def create(
        cls,
        corpus_id: Union[str, int],
        config: AgentConfig,
        tools: Optional[List[PydanticAIToolWrapper]] = None,
    ) -> "PydanticAICorpusAgent":
        """Create a modern Pydantic AI corpus agent.
        
        Args:
            corpus_id: Corpus ID
            config: Base agent configuration
            tools: Optional list of Pydantic AI tools
            
        Returns:
            PydanticAICorpusAgent instance
        """
        # Create corpus context using core factories
        context = await CoreCorpusAgentFactory.create_context(corpus_id, config)
        
        # Create conversation manager
        conversation_manager = await CoreConversationManager.create_for_corpus(
            context.corpus,
            config.user_id,
            config
        )
        
        # Convert base config to Pydantic AI config
        pydantic_config = PydanticAIAgentConfig(
            model_name=config.model_name,
            system_prompt=config.system_prompt,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            streaming=config.streaming,
            tools=tools or [],
        )
        
        # Create and return agent
        return cls(context, conversation_manager, pydantic_config)

    async def chat(self, message: str, store_messages: bool = True) -> UnifiedChatResponse:
        """Send a message and get a response using modern Pydantic AI patterns.
        
        Args:
            message: User message
            store_messages: Whether to store messages in conversation
            
        Returns:
            Unified chat response
        """
        user_msg_id = None
        llm_msg_id = None
        
        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(message)

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message("LLM")

            # TODO: Implement when Pydantic AI is integrated
            # response = await self._agent.run(message)
            # For now, return a placeholder response
            content = f"[PydanticAI Placeholder] Response to: {message}"
            
            # Extract sources (placeholder for now)
            sources = [
                SourceNode(
                    annotation_id=0,
                    content="This is a placeholder source from PydanticAI agent",
                    metadata={"corpus_id": self.context.corpus.id},
                    similarity_score=0.95
                )
            ]

            # Complete the message atomically with content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, 
                    content, 
                    sources, 
                    {"framework": "pydantic_ai", "corpus_id": self.context.corpus.id}
                )

            return UnifiedChatResponse(
                content=content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"framework": "pydantic_ai", "corpus_id": self.context.corpus.id}
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(llm_msg_id, f"Error: {str(e)}")
            raise

    async def stream(self, message: str, store_messages: bool = True) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response using modern patterns.
        
        Args:
            message: User message
            store_messages: Whether to store messages in conversation
            
        Yields:
            Unified stream response chunks
        """
        user_msg_id = None
        llm_msg_id = None
        accumulated_content = ""
        sources = []
        
        try:
            # Store user message if configured
            if store_messages and self.conversation_manager.config.store_user_messages:
                user_msg_id = await self.conversation_manager.store_user_message(message)

            # Create placeholder for LLM message if storing
            if store_messages and self.conversation_manager.config.store_llm_messages:
                llm_msg_id = await self.conversation_manager.create_placeholder_message("LLM")

            # TODO: Implement when Pydantic AI is integrated
            # async for chunk in self._agent.run_stream(message):
            #     accumulated_content += chunk
            #     yield UnifiedStreamResponse(
            #         content=chunk,
            #         accumulated_content=accumulated_content,
            #         sources=sources,
            #         user_message_id=user_msg_id,
            #         llm_message_id=llm_msg_id,
            #         is_complete=False,
            #         metadata={"framework": "pydantic_ai"}
            #     )
            
            # For now, simulate streaming with placeholder content
            placeholder_response = f"[PydanticAI Streaming] Response to: {message}"
            words = placeholder_response.split()
            
            for i, word in enumerate(words):
                chunk = word + " " if i < len(words) - 1 else word
                accumulated_content += chunk
                
                yield UnifiedStreamResponse(
                    content=chunk,
                    accumulated_content=accumulated_content,
                    sources=sources,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=False,
                    metadata={"framework": "pydantic_ai", "corpus_id": self.context.corpus.id}
                )

            # Add sources after streaming is complete
            sources = [
                SourceNode(
                    annotation_id=0,
                    content="This is a placeholder source from PydanticAI agent",
                    metadata={"corpus_id": self.context.corpus.id},
                    similarity_score=0.95
                )
            ]

            # Complete the message atomically with final content and sources
            if llm_msg_id:
                await self.conversation_manager.complete_message(
                    llm_msg_id, 
                    accumulated_content, 
                    sources, 
                    {"framework": "pydantic_ai", "corpus_id": self.context.corpus.id}
                )

            # Send final response with sources
            yield UnifiedStreamResponse(
                content="",
                accumulated_content=accumulated_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                is_complete=True,
                metadata={"framework": "pydantic_ai", "corpus_id": self.context.corpus.id}
            )

        except Exception as e:
            # Cancel placeholder message on error
            if llm_msg_id:
                await self.conversation_manager.cancel_message(llm_msg_id, f"Error: {str(e)}")
            raise

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)

    async def store_llm_message(self, content: str) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(content)

    async def update_message(self, message_id: int, content: str, metadata: Optional[dict] = None) -> None:
        """Update an existing message."""
        await self.conversation_manager.update_message(message_id, content, metadata)

    # Legacy compatibility methods
    async def stream_chat(self, message: str) -> AsyncGenerator[str, None]:
        """Legacy method for backward compatibility."""
        async for response in self.stream(message):
            if response.content:
                yield response.content

    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Legacy method for backward compatibility."""
        if msg_type.upper() == "LLM":
            return await self.conversation_manager.store_llm_message(content)
        else:
            return await self.conversation_manager.store_user_message(content)


# Factory functions following modern patterns
async def create_pydantic_ai_document_agent(
    document: Union[str, int, Document],
    config: AgentConfig,
    tools: Optional[List[PydanticAIToolWrapper]] = None,
) -> PydanticAIDocumentAgent:
    """Create a Pydantic AI document agent using modern patterns.
    
    Args:
        document: Document to create agent for
        config: Agent configuration
        tools: Optional tools
        
    Returns:
        PydanticAIDocumentAgent instance
    """
    return await PydanticAIDocumentAgent.create(document, config, tools)


async def create_pydantic_ai_corpus_agent(
    corpus_id: Union[str, int],
    config: AgentConfig,
    tools: Optional[List[PydanticAIToolWrapper]] = None,
) -> PydanticAICorpusAgent:
    """Create a Pydantic AI corpus agent using modern patterns.
    
    Args:
        corpus_id: Corpus ID
        config: Agent configuration
        tools: Optional tools
        
    Returns:
        PydanticAICorpusAgent instance
    """
    return await PydanticAICorpusAgent.create(corpus_id, config, tools)
