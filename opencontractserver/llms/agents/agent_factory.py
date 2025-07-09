"""Unified agent factory that can create agents for different frameworks."""

import logging
from typing import Callable, Optional, Union

from django.conf import settings

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    CoreAgent,
    _is_public,
    get_default_config,
)
from opencontractserver.llms.tools.tool_factory import CoreTool, UnifiedToolFactory
from opencontractserver.llms.types import AgentFramework

logger = logging.getLogger(__name__)


class UnifiedAgentFactory:
    """Factory that creates agents using different frameworks with a common interface."""

    @staticmethod
    async def create_document_agent(
        document: Union[str, int, Document],
        corpus: Optional[Union[str, int, Corpus]] = None,
        framework: AgentFramework = AgentFramework.PYDANTIC_AI,
        user_id: Optional[int] = None,
        # Enhanced conversation management
        conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
        # Configuration options
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        streaming: Optional[bool] = None,
        embedder_path: Optional[str] = None,
        tools: Optional[list[Union[CoreTool, Callable, str]]] = None,
        store_user_messages: Optional[bool] = None,
        store_llm_messages: Optional[bool] = None,
        # Legacy compatibility
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        **kwargs,
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
            store_user_messages: Optional enable/disable storing user messages
            store_llm_messages: Optional enable/disable storing LLM messages
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

        persistence_flags: dict[str, bool] = {}
        if store_user_messages is not None:
            persistence_flags["store_user_messages"] = store_user_messages
        if store_llm_messages is not None:
            persistence_flags["store_llm_messages"] = store_llm_messages

        config = get_default_config(
            user_id=user_id,
            model_name=model or kwargs.get("model_name", "gpt-4o-mini"),
            system_prompt=system_prompt,
            temperature=temperature or kwargs.get("temperature", 0.7),
            max_tokens=max_tokens,
            streaming=(
                streaming if streaming is not None else kwargs.get("streaming", True)
            ),
            conversation=conversation,
            conversation_id=conversation_id,
            loaded_messages=loaded_messages,
            embedder_path=embedder_path,
            tools=tools or [],
            **persistence_flags,
            **kwargs,
        )

        # --------------------------------------------------------------
        # Public corpus/document ⇒ strip approval-gated tools
        # --------------------------------------------------------------

        # Resolve privacy status (best-effort – failures default to private)
        try:
            doc_obj = (
                document
                if isinstance(document, Document)
                else await Document.objects.aget(id=document)
            )
            corpus_obj = None
            if corpus is not None:
                corpus_obj = (
                    corpus
                    if isinstance(corpus, Corpus)
                    else await Corpus.objects.aget(id=corpus)
                )
        except (Document.DoesNotExist, Corpus.DoesNotExist):
            # Re-raise these exceptions so callers can handle them appropriately
            raise
        except Exception:
            # For other exceptions (e.g., network errors), default to private
            doc_obj = None
            corpus_obj = None

        public_context = _is_public(doc_obj) or (corpus_obj and _is_public(corpus_obj))

        filtered_tools: list[Union[CoreTool, Callable, str]] = []
        if tools:
            for t in tools:
                if public_context and isinstance(t, CoreTool) and t.requires_approval:
                    logger.warning(
                        "Skipping approval-required tool '%s' for public context",
                        t.name,
                    )
                    continue
                # Filter out corpus-dependent tools when no corpus provided
                if corpus is None and isinstance(t, CoreTool) and t.requires_corpus:
                    logger.info(
                        "Skipping corpus-required tool '%s' - no corpus provided for document agent",
                        t.name,
                    )
                    continue
                filtered_tools.append(t)
        tools = filtered_tools

        # Keep config in sync so downstream logic respects the filtered list
        config.tools = tools

        # Convert tools to framework-specific format
        framework_tools = (
            _convert_tools_for_framework(tools, framework) if tools else []
        )

        if framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.agents.pydantic_ai_agents import (
                PydanticAIDocumentAgent,
            )

            return await PydanticAIDocumentAgent.create(
                document, corpus, config, framework_tools
            )
        else:
            raise ValueError(f"Unsupported framework: {framework}")

    @staticmethod
    async def create_corpus_agent(
        corpus: Union[str, int, Corpus],
        framework: AgentFramework = AgentFramework.PYDANTIC_AI,
        user_id: Optional[int] = None,
        # Enhanced conversation management
        conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
        # Configuration options
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        streaming: Optional[bool] = None,
        embedder_path: Optional[str] = None,
        tools: Optional[list[Union[CoreTool, Callable, str]]] = None,
        store_user_messages: Optional[bool] = None,
        store_llm_messages: Optional[bool] = None,
        # Legacy compatibility
        override_conversation: Optional[Conversation] = None,
        override_system_prompt: Optional[str] = None,
        **kwargs,
    ) -> CoreAgent:
        """Create a corpus agent using the specified framework.

        Args:
            corpus: Corpus ID or instance
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
            store_user_messages: Optional enable/disable storing user messages
            store_llm_messages: Optional enable/disable storing LLM messages
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

        persistence_flags = {}
        if store_user_messages is not None:
            persistence_flags["store_user_messages"] = store_user_messages
        if store_llm_messages is not None:
            persistence_flags["store_llm_messages"] = store_llm_messages

        config = get_default_config(
            user_id=user_id,
            model_name=model or kwargs.get("model_name", "gpt-4o-mini"),
            system_prompt=system_prompt,
            temperature=temperature or kwargs.get("temperature", 0.7),
            max_tokens=max_tokens,
            streaming=(
                streaming if streaming is not None else kwargs.get("streaming", True)
            ),
            conversation=conversation,
            conversation_id=conversation_id,
            loaded_messages=loaded_messages,
            embedder_path=embedder_path,
            tools=tools or [],
            **persistence_flags,
            **kwargs,
        )

        # --------------------------------------------------------------
        # Public corpus/document ⇒ strip approval-gated tools
        # --------------------------------------------------------------

        # Resolve privacy status (best-effort – failures default to private)
        try:
            corpus_obj = (
                corpus
                if isinstance(corpus, Corpus)
                else await Corpus.objects.aget(id=corpus)
            )
        except Corpus.DoesNotExist:
            # Re-raise this exception so callers can handle it appropriately
            raise
        except Exception:
            # For other exceptions (e.g., network errors), default to private
            corpus_obj = None

        public_context = _is_public(corpus_obj)

        filtered_tools: list[Union[CoreTool, Callable, str]] = []
        if tools:
            for t in tools:
                if public_context and isinstance(t, CoreTool) and t.requires_approval:
                    logger.warning(
                        "Skipping approval-required tool '%s' for public context",
                        t.name,
                    )
                    continue
                filtered_tools.append(t)
        tools = filtered_tools

        # Keep config in sync so downstream logic respects the filtered list
        config.tools = tools

        # Convert tools to framework-specific format
        framework_tools = (
            _convert_tools_for_framework(tools, framework) if tools else []
        )

        if framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.agents.pydantic_ai_agents import (
                PydanticAICorpusAgent,
            )

            return await PydanticAICorpusAgent.create(corpus, config, framework_tools)
        else:
            raise ValueError(f"Unsupported framework: {framework}")


def _convert_tools_for_framework(
    tools: list[Union[CoreTool, Callable, str]], framework: AgentFramework
) -> list:
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
            logger.debug(f"Tool name '{tool}' will be resolved by framework")
            continue
        else:
            logger.warning(f"Ignoring invalid tool: {tool}")

    # Convert to framework-specific tools
    return UnifiedToolFactory.create_tools(core_tools, framework)


# Enhanced convenience functions that maintain backward compatibility
async def create_document_agent(
    document: Union[str, int, Document],
    framework: Union[AgentFramework, str, None] = None,
    user_id: Optional[int] = None,
    conversation: Optional[Conversation] = None,
    conversation_id: Optional[int] = None,
    loaded_messages: Optional[list[ChatMessage]] = None,
    embedder_path: Optional[str] = None,
    # Legacy compatibility
    override_conversation: Optional[Conversation] = None,
    override_system_prompt: Optional[str] = None,
    **kwargs,
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
    if framework is None:
        framework = getattr(
            settings, "LLMS_DOCUMENT_AGENT_FRAMEWORK", AgentFramework.PYDANTIC_AI
        )
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
        **kwargs,
    )


async def create_corpus_agent(
    corpus: Union[str, int, Corpus],
    framework: Union[AgentFramework, str, None] = None,
    user_id: Optional[int] = None,
    conversation: Optional[Conversation] = None,
    conversation_id: Optional[int] = None,
    loaded_messages: Optional[list[ChatMessage]] = None,
    # Legacy compatibility
    override_conversation: Optional[Conversation] = None,
    override_system_prompt: Optional[str] = None,
    **kwargs,
) -> CoreAgent:
    """Create a corpus agent (enhanced backward compatibility wrapper).

    Args:
        corpus: Corpus ID or instance
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
    if framework is None:
        framework = getattr(
            settings, "LLMS_CORPUS_AGENT_FRAMEWORK", AgentFramework.PYDANTIC_AI
        )
    if isinstance(framework, str):
        framework = AgentFramework(framework)

    return await UnifiedAgentFactory.create_corpus_agent(
        corpus=corpus,
        framework=framework,
        user_id=user_id,
        conversation=conversation,
        conversation_id=conversation_id,
        loaded_messages=loaded_messages,
        override_conversation=override_conversation,
        override_system_prompt=override_system_prompt,
        **kwargs,
    )
