"""Clean PydanticAI implementation following PydanticAI patterns."""

import logging
import dataclasses
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Union

from opencontractserver.corpuses.models import Corpus
from pydantic_ai import Agent as PydanticAIAgent
from pydantic_ai.messages import ModelMessage


from opencontractserver.conversations.models import Conversation
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgentBase,
    CoreConversationManager,
    CoreDocumentAgentFactory,
    CoreCorpusAgentFactory,
    DocumentAgentContext,
    CorpusAgentContext,
    UnifiedChatResponse,
    UnifiedStreamResponse,
    get_default_config,
)
from opencontractserver.llms.tools.pydantic_ai_tools import PydanticAIDependencies
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
)
from pydantic import TypeAdapter, ValidationError

from opencontractserver.utils.embeddings import aget_embedder

logger = logging.getLogger(__name__)


class PydanticAICoreAgent(CoreAgentBase):
    """PydanticAI implementation of CoreAgentBase following PydanticAI patterns."""

    def __init__(
        self,
        config: AgentConfig,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(config, conversation_manager)
        self.pydantic_ai_agent = pydantic_ai_agent
        self.agent_deps = agent_deps

    async def _get_message_history(self) -> Optional[List[ModelMessage]]:
        """
        Convert OpenContracts `ChatMessage` history to the Pydantic-AI
        `ModelMessage` format.

        `UserPrompt` does **not** exist in Pydantic-AI's public API, so we map
        both human and LLM messages to plain `ModelMessage` instances instead.
        """
        raw_messages = await self.conversation_manager.get_conversation_messages()
        if not raw_messages:
            return None

        history: list[ModelMessage] = []
        for msg in raw_messages:
            # only map HUMAN→user and LLM→assistant; skip SYSTEM
            t = msg.msg_type.upper()
            if t == "HUMAN":
                role = "user"
            elif t == "LLM":
                role = "assistant"
            else:
                continue
            try:
                # use Pydantic's adapter to ensure proper validation
                adapter = TypeAdapter(ModelMessage)
                history.append(adapter.validate_python({"role": role, "content": msg.content}))
            except ValidationError as ve:
                logger.warning(
                    "Skipping message %s in history (validation error: %s)", msg.id, ve
                )
        return history or None

    async def chat(self, message: str, **kwargs) -> UnifiedChatResponse:
        """Send a message and get a complete response using PydanticAI Agent.run()."""
        user_msg_id = await self.store_user_message(message)
        
        message_history = await self._get_message_history()

        try:
            run_result = await self.pydantic_ai_agent.run(
                message,
                deps=self.agent_deps,
                message_history=message_history,
                **kwargs
            )
            
            llm_response_content = str(run_result.data)
            
            # Extract sources from result if available (would come from tools)
            sources = []
            if hasattr(run_result, 'sources') and run_result.sources:
                sources = run_result.sources
            
            usage_data = _usage_to_dict(run_result.usage())
            
            llm_msg_id = await self.store_llm_message(
                llm_response_content, 
                sources=sources,
                metadata={"usage": usage_data}
            )
            
            return UnifiedChatResponse(
                content=llm_response_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"usage": usage_data}
            )
        except Exception as e:
            logger.exception(f"Error in PydanticAI chat: {e}")
            raise

    async def stream(self, message: str, **kwargs) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response using PydanticAI Agent.run_stream()."""
        user_msg_id = await self.store_user_message(message)
        
        # Create placeholder LLM message that we'll update as we stream
        llm_msg_id = await self.store_llm_message("", metadata={"state": "streaming"})
        
        accumulated_content = ""
        message_history = await self._get_message_history()

        try:
            async with self.pydantic_ai_agent.run_stream(
                message,
                deps=self.agent_deps,
                message_history=message_history,
                **kwargs,
            ) as stream_result:

                # 1) incremental chunks
                async for text_delta in stream_result.stream_text(delta=True):
                    accumulated_content += text_delta
                    await self.update_message(
                        llm_msg_id, accumulated_content, metadata={"state": "streaming"}
                    )
                    yield UnifiedStreamResponse(
                        content=text_delta,
                        accumulated_content=accumulated_content,
                        user_message_id=user_msg_id,
                        llm_message_id=llm_msg_id,
                        is_complete=False,
                    )

                # 2) final content -------------------------------------------------
                try:
                    # Prefer the structured helper if available
                    final_content = str(await stream_result.get_output())
                except Exception:                            # noqa: BLE001
                    # Fallback to what we already assembled
                    final_content = accumulated_content

                usage_data = _usage_to_dict(stream_result.usage())
                sources: list[Any] = getattr(stream_result, "sources", []) or []

                await self.update_message(
                    llm_msg_id,
                    final_content,
                    sources=sources,
                    metadata={"state": "completed", "usage": usage_data},
                )

                yield UnifiedStreamResponse(
                    content="",
                    accumulated_content=final_content,
                    sources=sources,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=True,
                    metadata={"usage": usage_data},
                )

        except Exception as e:
            await self.update_message(
                llm_msg_id,
                accumulated_content,
                metadata={"state": "error", "error": str(e)}
            )
            logger.exception(f"Error in PydanticAI stream: {e}")
            raise


def _prepare_pydantic_ai_model_settings(config: AgentConfig) -> Optional[Dict[str, Any]]:
    """Helper to construct model_settings dict for PydanticAI Agent."""
    model_settings = {}
    if config.temperature is not None:
        model_settings['temperature'] = config.temperature
    if config.max_tokens is not None:
        model_settings['max_tokens'] = config.max_tokens
    return model_settings if model_settings else None


class PydanticAIDocumentAgent(PydanticAICoreAgent):
    """PydanticAI document agent."""

    def __init__(
        self,
        context: DocumentAgentContext,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(context.config, conversation_manager, pydantic_ai_agent, agent_deps)
        self.context = context

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        corpus: Union[str, int, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[List[Callable]] = None,
        *,
        conversation: Optional[Conversation] = None,
        **kwargs: Any,
    ) -> "PydanticAIDocumentAgent":
        """Create a Pydantic-AI document agent tied to a specific corpus."""
        if config is None:
            config = get_default_config()
        
        logger.info(f"Creating Pydantic-AI document agent for document {document} and corpus {corpus}")
        logger.info(f"Config (type {type(config)}): {config}")
        # Provide explicit corpus so the factory can pick the proper embedder
        context = await CoreDocumentAgentFactory.create_context(
            document,
            corpus,
            config,
        )

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_document(
            context.corpus,
            context.document,
            user_id=config.user_id,
            config=config,
            override_conversation=conversation
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Resolve embedder_path asynchronously if not already set, otherwise this is done synchronously in vector store...
        if config.embedder_path is None and context.corpus and context.corpus.id:
            logger.info(f"Attempting to derive embedder_path for corpus {context.corpus.id} asynchronously.")
            try:
                _, resolved_embedder_path = await aget_embedder(
                    corpus_id=context.corpus.id
                )
                if resolved_embedder_path:
                    config.embedder_path = resolved_embedder_path
                    logger.info(f"Derived embedder_path: {config.embedder_path}")
                else:
                    logger.warning(f"Could not derive embedder_path for corpus {context.corpus.id}.")
            except Exception as e:
                logger.warning(f"Error deriving embedder_path for corpus {context.corpus.id}: {e}")

        model_settings = _prepare_pydantic_ai_model_settings(config)
        
        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=tools or [],
            model_settings=model_settings
        )
        
        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            **kwargs
        )
        
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            embedder_path=config.embedder_path,
        )
        
        agent_deps_instance.vector_store = vector_store
        
        return cls(
            context=context,
            conversation_manager=conversation_manager,
            pydantic_ai_agent=pydantic_ai_agent_instance,
            agent_deps=agent_deps_instance,
        )


class PydanticAICorpusAgent(PydanticAICoreAgent):
    """PydanticAI corpus agent."""

    def __init__(
        self,
        context: CorpusAgentContext,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(context.config, conversation_manager, pydantic_ai_agent, agent_deps)
        self.context = context

    @classmethod
    async def create(
        cls,
        corpus: Union[int, str, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[List[Callable]] = None,
        conversation: Optional[Conversation] = None,
        **kwargs
    ) -> "PydanticAICorpusAgent":
        """Create a PydanticAI corpus agent using core functionality."""
        if config is None:
            config = get_default_config()
            
        if not isinstance(corpus, Corpus): # Ensure corpus is loaded if ID is passed
            corpus_obj = await Corpus.objects.aget(id=corpus)
        else:
            corpus_obj = corpus
        
        context = await CoreCorpusAgentFactory.create_context(corpus_obj, config)

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_corpus(
            corpus=corpus_obj,
            user_id=config.user_id,
            config=config,
            override_conversation=conversation
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Resolve embedder_path asynchronously if not already set
        if config.embedder_path is None and corpus_obj and corpus_obj.id:
            logger.info(f"Attempting to derive embedder_path for corpus {corpus_obj.id} asynchronously.")
            try:
                _, resolved_embedder_path = await aget_embedder(
                    corpus_id=corpus_obj.id
                )
                if resolved_embedder_path:
                    config.embedder_path = resolved_embedder_path
                    logger.info(f"Derived embedder_path: {config.embedder_path}")
                else:
                    logger.warning(f"Could not derive embedder_path for corpus {corpus_obj.id}.")
            except Exception as e:
                logger.warning(f"Error deriving embedder_path for corpus {corpus_obj.id}: {e}")
        
        model_settings = _prepare_pydantic_ai_model_settings(config)

        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=tools or [],
            model_settings=model_settings
        )
        
        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            **kwargs
        )
        
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            embedder_path=config.embedder_path,
        )
        
        agent_deps_instance.vector_store = vector_store
        
        return cls(
            context=context,
            conversation_manager=conversation_manager,
            pydantic_ai_agent=pydantic_ai_agent_instance,
            agent_deps=agent_deps_instance,
        )


# --------------------------------------------------------------------------- #
# helpers                                                                    #
# --------------------------------------------------------------------------- #
def _usage_to_dict(usage: Any) -> Optional[dict[str, Any]]:
    """
    Convert a pydantic-ai ``Usage`` instance (or any other arbitrary object)
    into a plain ``dict`` that can be attached to message metadata.
    Falls back to ``vars()`` if no structured helper is available.
    """
    if usage is None:  # noqa: D401 – early-exit guard
        return None

    if hasattr(usage, "model_dump"):         # pydantic v2
        return usage.model_dump()            # type: ignore[arg-type]
    if dataclasses.is_dataclass(usage):      # dataclass
        return dataclasses.asdict(usage)
    try:                                     # mapping-style object
        return dict(usage)                   # type: ignore[arg-type]
    except Exception:                        # pragma: no cover
        return vars(usage)
