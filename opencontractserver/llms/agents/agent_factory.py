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
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
        embedder_path: Optional[str] = None,
        tools: Optional[List[Union[CoreTool, Callable]]] = None,
        **kwargs
    ) -> CoreAgent:
        """Create a document agent using the specified framework.

        Args:
            document: Document ID or instance
            framework: Which agent framework to use
            user_id: Optional user ID for message attribution
            override_conversation: Optional existing conversation
            override_system_prompt: Optional custom system prompt
            loaded_messages: Optional existing messages
            embedder_path: Optional embedder path
            tools: Optional list of tools (CoreTool instances or functions)
            **kwargs: Additional framework-specific arguments

        Returns:
            CoreAgent: Framework-specific agent implementing the CoreAgent protocol
        """
        config = get_default_config(
            user_id=user_id,
            system_prompt=override_system_prompt,
            conversation=override_conversation,
            loaded_messages=loaded_messages,
            embedder_path=embedder_path,
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
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
        tools: Optional[List[Union[CoreTool, Callable]]] = None,
        **kwargs
    ) -> CoreAgent:
        """Create a corpus agent using the specified framework.

        Args:
            corpus_id: Corpus ID
            framework: Which agent framework to use
            user_id: Optional user ID for message attribution
            override_conversation: Optional existing conversation
            override_system_prompt: Optional custom system prompt
            loaded_messages: Optional existing messages
            tools: Optional list of tools (CoreTool instances or functions)
            **kwargs: Additional framework-specific arguments

        Returns:
            CoreAgent: Framework-specific agent implementing the CoreAgent protocol
        """
        config = get_default_config(
            user_id=user_id,
            system_prompt=override_system_prompt,
            conversation=override_conversation,
            loaded_messages=loaded_messages,
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
    tools: List[Union[CoreTool, Callable]],
    framework: AgentFramework
) -> List:
    """Convert tools to framework-specific format.

    Args:
        tools: List of CoreTool instances or functions
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
        else:
            logger.warning(f"Ignoring invalid tool: {tool}")

    # Convert to framework-specific tools
    return UnifiedToolFactory.create_tools(core_tools, framework)


# Convenience functions that maintain backward compatibility
async def create_document_agent(
    document: Union[str, int, Document],
    framework: Union[AgentFramework, str] = AgentFramework.LLAMA_INDEX,
    **kwargs
) -> CoreAgent:
    """Create a document agent (backward compatibility wrapper)."""
    if isinstance(framework, str):
        framework = AgentFramework(framework)
    return await UnifiedAgentFactory.create_document_agent(document, framework, **kwargs)


async def create_corpus_agent(
    corpus_id: Union[str, int],
    framework: Union[AgentFramework, str] = AgentFramework.LLAMA_INDEX,
    **kwargs
) -> CoreAgent:
    """Create a corpus agent (backward compatibility wrapper)."""
    if isinstance(framework, str):
        framework = AgentFramework(framework)
    return await UnifiedAgentFactory.create_corpus_agent(corpus_id, framework, **kwargs)
