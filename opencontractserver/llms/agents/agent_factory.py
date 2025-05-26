"""Unified agent factory that can create agents for different frameworks."""

import logging
from typing import Optional, Union, List, Callable

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.documents.models import Document
from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.core_agents import (
    CoreAgent,
    get_default_config,
)
from opencontractserver.llms.tools.tool_factory import CoreTool, UnifiedToolFactory

logger = logging.getLogger(__name__)


class UnifiedAgentFactory:
    """Factory that creates agents using different frameworks with a common interface."""

    @staticmethod
    async def create_document_agent(
        document: Union[str, int, Document],
        framework: AgentFramework = AgentFramework.LLAMA_INDEX,
        user_id: Optional[int] = None,
        # Enhanced conversation management
        conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[List[ChatMessage]] = None,
        # Configuration options
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        streaming: Optional[bool] = None,
        embedder_path: Optional[str] = None,
        tools: Optional[List[Union[CoreTool, Callable, str]]] = None,
        # Legacy compatibility
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        **kwargs
    ) -> CoreAgent:
        """Create a document agent using the specified framework.

        Args:
            document: Document ID or instance
            framework: Which agent framework to use
            user_id: Optional user ID for message attribution
            conversation: Optional existing conversation object
            conversation_id: Optional existing conversation ID
            loaded_messages: Optional existing messages to load
            model: Optional model name (e.g., "gpt-4o-mini")
            system_prompt: Optional custom system prompt
            temperature: Optional temperature for response generation
            max_tokens: Optional maximum tokens in response
            streaming: Optional enable/disable streaming
            embedder_path: Optional embedder path
            tools: Optional list of tools (CoreTool instances, functions, or tool names)
            override_conversation: Legacy parameter (use 'conversation' instead)
            override_system_prompt: Legacy parameter (use 'system_prompt' instead)
            **kwargs: Additional framework-specific arguments

        Returns:
            CoreAgent: Framework-specific agent implementing the CoreAgent protocol
        """
        # Handle legacy parameter names
        if override_conversation and not conversation:
            conversation = override_conversation
        if override_system_prompt and not system_prompt:
            system_prompt = override_system_prompt

        config = get_default_config(
            user_id=user_id,
            model_name=model or kwargs.get("model_name", "gpt-4o-mini"),
            system_prompt=system_prompt,
            temperature=temperature or kwargs.get("temperature", 0.7),
            max_tokens=max_tokens,
            streaming=streaming if streaming is not None else kwargs.get("streaming", True),
            conversation=conversation,
            conversation_id=conversation_id,
            loaded_messages=loaded_messages,
            embedder_path=embedder_path,
            tools=tools or [],
            **kwargs
        )

        # Convert tools to framework-specific format
        framework_tools = _convert_tools_for_framework(tools, framework) if tools else []

        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
            return await LlamaIndexDocumentAgent.create(document, config, framework_tools)
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAIDocumentAgent
            return await PydanticAIDocumentAgent.create(document, config, framework_tools)
        else:
            raise ValueError(f"Unsupported framework: {framework}")

    @staticmethod
    async def create_corpus_agent(
        corpus_id: Union[str, int],
        framework: AgentFramework = AgentFramework.LLAMA_INDEX,
        user_id: Optional[int] = None,
        # Enhanced conversation management
        conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[List[ChatMessage]] = None,
        # Configuration options
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        streaming: Optional[bool] = None,
        embedder_path: Optional[str] = None,
        tools: Optional[List[Union[CoreTool, Callable, str]]] = None,
        # Legacy compatibility
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        **kwargs
    ) -> CoreAgent:
        """Create a corpus agent using the specified framework.

        Args:
            corpus_id: Corpus ID
            framework: Which agent framework to use
            user_id: Optional user ID for message attribution
            conversation: Optional existing conversation object
            conversation_id: Optional existing conversation ID
            loaded_messages: Optional existing messages to load
            model: Optional model name (e.g., "gpt-4o-mini")
            system_prompt: Optional custom system prompt
            temperature: Optional temperature for response generation
            max_tokens: Optional maximum tokens in response
            streaming: Optional enable/disable streaming
            embedder_path: Optional embedder path
            tools: Optional list of tools (CoreTool instances, functions, or tool names)
            override_conversation: Legacy parameter (use 'conversation' instead)
            override_system_prompt: Legacy parameter (use 'system_prompt' instead)
            **kwargs: Additional framework-specific arguments

        Returns:
            CoreAgent: Framework-specific agent implementing the CoreAgent protocol
        """
        # Handle legacy parameter names
        if override_conversation and not conversation:
            conversation = override_conversation
        if override_system_prompt and not system_prompt:
            system_prompt = override_system_prompt

        config = get_default_config(
            user_id=user_id,
            model_name=model or kwargs.get("model_name", "gpt-4o-mini"),
            system_prompt=system_prompt,
            temperature=temperature or kwargs.get("temperature", 0.7),
            max_tokens=max_tokens,
            streaming=streaming if streaming is not None else kwargs.get("streaming", True),
            conversation=conversation,
            conversation_id=conversation_id,
            loaded_messages=loaded_messages,
            embedder_path=embedder_path,
            tools=tools or [],
            **kwargs
        )

        # Convert tools to framework-specific format
        framework_tools = _convert_tools_for_framework(tools, framework) if tools else []

        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.agents.llama_index_agents import LlamaIndexCorpusAgent
            return await LlamaIndexCorpusAgent.create(corpus_id, config, framework_tools)
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAICorpusAgent
            return await PydanticAICorpusAgent.create(corpus_id, config, framework_tools)
        else:
            raise ValueError(f"Unsupported framework: {framework}")


def _convert_tools_for_framework(
    tools: List[Union[CoreTool, Callable, str]],
    framework: AgentFramework
) -> List:
    """Convert tools to framework-specific format.

    Args:
        tools: List of CoreTool instances, functions, or tool names
        framework: Target framework

    Returns:
        List of framework-specific tools
    """
    core_tools = []

    for tool in tools:
        if isinstance(tool, CoreTool):
            core_tools.append(tool)
        elif callable(tool):
            # Convert function to CoreTool
            core_tools.append(CoreTool.from_function(tool))
        elif isinstance(tool, str):
            # Handle tool names - these will be resolved by the tool factory
            # For now, we'll pass them through and let the framework handle them
            logger.info(f"Tool name '{tool}' will be resolved by framework")
            continue
        else:
            logger.warning(f"Ignoring invalid tool: {tool}")

    # Convert to framework-specific tools
    return UnifiedToolFactory.create_tools(core_tools, framework)


# Enhanced convenience functions that maintain backward compatibility
async def create_document_agent(
    document: Union[str, int, Document],
    framework: Union[AgentFramework, str] = AgentFramework.LLAMA_INDEX,
    user_id: Optional[int] = None,
    conversation: Optional[Conversation] = None,
    conversation_id: Optional[int] = None,
    loaded_messages: Optional[List[ChatMessage]] = None,
    embedder_path: Optional[str] = None,
    # Legacy compatibility
    override_conversation: Optional[Conversation] = None,
    override_system_prompt: Optional[str] = None,
    **kwargs
) -> CoreAgent:
    """Create a document agent (enhanced backward compatibility wrapper).
    
    Args:
        document: Document ID or instance
        framework: Agent framework to use
        user_id: Optional user ID for message attribution
        conversation: Optional existing conversation object
        conversation_id: Optional existing conversation ID
        loaded_messages: Optional existing messages to load
        embedder_path: Optional embedder path
        override_conversation: Legacy parameter (use 'conversation' instead)
        override_system_prompt: Legacy parameter (use 'system_prompt' instead)
        **kwargs: Additional arguments passed to factory
        
    Returns:
        CoreAgent: Framework-specific agent
    """
    if isinstance(framework, str):
        framework = AgentFramework(framework)
    
    return await UnifiedAgentFactory.create_document_agent(
        document=document,
        framework=framework,
        user_id=user_id,
        conversation=conversation,
        conversation_id=conversation_id,
        loaded_messages=loaded_messages,
        embedder_path=embedder_path,
        override_conversation=override_conversation,
        override_system_prompt=override_system_prompt,
        **kwargs
    )


async def create_corpus_agent(
    corpus_id: Union[str, int],
    framework: Union[AgentFramework, str] = AgentFramework.LLAMA_INDEX,
    user_id: Optional[int] = None,
    conversation: Optional[Conversation] = None,
    conversation_id: Optional[int] = None,
    loaded_messages: Optional[List[ChatMessage]] = None,
    # Legacy compatibility
    override_conversation: Optional[Conversation] = None,
    override_system_prompt: Optional[str] = None,
    **kwargs
) -> CoreAgent:
    """Create a corpus agent (enhanced backward compatibility wrapper).
    
    Args:
        corpus_id: Corpus ID
        framework: Agent framework to use
        user_id: Optional user ID for message attribution
        conversation: Optional existing conversation object
        conversation_id: Optional existing conversation ID
        loaded_messages: Optional existing messages to load
        override_conversation: Legacy parameter (use 'conversation' instead)
        override_system_prompt: Legacy parameter (use 'system_prompt' instead)
        **kwargs: Additional arguments passed to factory
        
    Returns:
        CoreAgent: Framework-specific agent
    """
    if isinstance(framework, str):
        framework = AgentFramework(framework)
    
    return await UnifiedAgentFactory.create_corpus_agent(
        corpus_id=corpus_id,
        framework=framework,
        user_id=user_id,
        conversation=conversation,
        conversation_id=conversation_id,
        loaded_messages=loaded_messages,
        override_conversation=override_conversation,
        override_system_prompt=override_system_prompt,
        **kwargs
    )
