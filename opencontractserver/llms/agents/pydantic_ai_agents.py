"""Clean PydanticAI implementation following PydanticAI patterns."""

import dataclasses
import logging
from typing import Any, AsyncGenerator, Callable, Optional, Union

from pydantic_ai import Agent as PydanticAIAgent
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    UserPromptPart,
    ToolReturnPart,
)

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
from opencontractserver.llms.tools.pydantic_ai_tools import PydanticAIDependencies
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
)
from opencontractserver.utils.embeddings import aget_embedder

logger = logging.getLogger(__name__)


def _to_source_node(raw: Any) -> SourceNode:
    """
    Convert an item coming from pydantic-ai (dict or BaseModel) to
    our framework-agnostic SourceNode.
    """
    if isinstance(raw, SourceNode):        # already normalised
        return raw

    if hasattr(raw, "model_dump"):
        raw = raw.model_dump()

    # raw is now a dict coming from PydanticAIVectorSearchResponse
    return SourceNode(
        annotation_id=int(raw.get("annotation_id", 0)),
        content=raw.get("content", ""),
        metadata=raw,
        similarity_score=raw.get("similarity_score", 1.0),
    )


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

    async def _initialise_llm_message(self, user_text: str) -> tuple[int, int]:
        """Initialize user and LLM messages for a conversation turn."""
        user_id = await self.store_user_message(user_text)
        llm_id = await self.create_placeholder_message("LLM")
        return user_id, llm_id

    async def _finalise_llm_message(
        self,
        llm_id: int,
        final_content: str,
        sources: list[SourceNode],
        usage: dict[str, Any] | None,
    ) -> None:
        """Finalize LLM message with content, sources, and metadata."""
        await self.complete_message(
            llm_id,
            final_content,
            sources=sources,
            metadata={"usage": usage, "framework": "pydantic_ai"},
        )

    async def _get_message_history(self) -> Optional[list[ModelMessage]]:
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
            msg_type_upper = msg.msg_type.upper()
            content = msg.content

            # Skip any messages with no actual content
            if not content.strip():
                continue

            if msg_type_upper == "HUMAN":
                history.append(ModelRequest(parts=[UserPromptPart(content=content)]))
            elif msg_type_upper == "LLM":
                history.append(ModelResponse(parts=[TextPart(content=content)]))
            elif msg_type_upper == "SYSTEM":
                # System messages are also part of a "request" to the model
                history.append(ModelRequest(parts=[SystemPromptPart(content=content)]))
            # else: We skip unknown types or those not directly mappable here

        return history or None

    async def chat(self, message: str, **kwargs) -> UnifiedChatResponse:
        """Send a message and get a complete response using PydanticAI Agent.run()."""
        logger.info(f"[PydanticAI sync chat] Starting chat with message: {message!r}")
        user_msg_id, llm_msg_id = await self._initialise_llm_message(message)

        message_history = await self._get_message_history()

        try:
            # Prepare parameters for run(); include history only if available
            run_kwargs: dict[str, Any] = {"deps": self.agent_deps}
            if message_history:
                run_kwargs["message_history"] = message_history
            run_kwargs.update(kwargs)
            run_result = await self.pydantic_ai_agent.run(message, **run_kwargs)

            llm_response_content = str(run_result.data)
            logger.debug(f"[PydanticAI chat] llm_response_content: {dir(run_result)}")

            # Extract and convert sources from result if available
            sources = [_to_source_node(s) for s in getattr(run_result, "sources", [])]

            usage_data = _usage_to_dict(run_result.usage())

            # Finalize the message atomically
            await self._finalise_llm_message(llm_msg_id, llm_response_content, sources, usage_data)

            return UnifiedChatResponse(
                content=llm_response_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"usage": usage_data},
            )
        except Exception as e:
            # Cancel placeholder message on error
            await self.cancel_message(llm_msg_id, f"Error: {str(e)}")
            logger.exception(f"Error in PydanticAI chat: {e}")
            raise

    async def stream(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response using PydanticAI Agent.run_stream()."""
        logger.info(f"[PydanticAI stream] Starting stream with message: {message!r}")
        user_msg_id, llm_msg_id = await self._initialise_llm_message(message)

        accumulated_content = ""
        message_history = await self._get_message_history()
        logger.info(f"[PydanticAI stream] Initial message_history for PydanticAIAgent: {message_history!r}")

        try:
            stream_kwargs: dict[str, Any] = {"deps": self.agent_deps}
            if message_history:
                stream_kwargs["message_history"] = message_history
            stream_kwargs.update(kwargs)

            async with self.pydantic_ai_agent.run_stream(
                message, **stream_kwargs
            ) as stream_result:
                logger.info("[PydanticAI stream] Entered PydanticAIAgent.run_stream context")

                # 1. Stream textual delta for the user interface
                async for text_delta in stream_result.stream_text(delta=True, debounce_by=0.1):
                    logger.debug(f"[PydanticAI stream] Received text_delta: {text_delta!r}")
                    accumulated_content += text_delta
                    await self.update_message(
                        llm_msg_id, accumulated_content, metadata={"state": "streaming_text"}
                    )
                    yield UnifiedStreamResponse(
                        content=text_delta,
                        accumulated_content=accumulated_content,
                        user_message_id=user_msg_id,
                        llm_message_id=llm_msg_id,
                        is_complete=False,
                    )

                # 2. Ensure the stream is fully processed and get the final textual output
                final_llm_text_output = await stream_result.get_output()
                logger.info(f"[PydanticAI stream] Final LLM text output from stream_result.get_output(): {final_llm_text_output!r}")
                accumulated_content = final_llm_text_output

                # 3. Extract sources from the *complete message history* of the Pydantic AI run
                all_pai_messages: list[ModelMessage] = stream_result.all_messages()
                logger.info(f"[PydanticAI stream] All messages from PydanticAIAgent run: {len(all_pai_messages)} messages.")

                extracted_oc_source_nodes: list[SourceNode] = []
                
                # Define the name of your vector search tool as PydanticAI sees it.
                # If you passed `vector_store_instance.similarity_search` to tools,
                # PydanticAI uses the method's actual name: "similarity_search".
                vector_search_tool_name = "similarity_search" 

                for pai_msg_item in reversed(all_pai_messages):
                    if pai_msg_item.kind == 'request':
                        if hasattr(pai_msg_item, 'parts') and isinstance(pai_msg_item.parts, list):
                            for part in pai_msg_item.parts:
                                if isinstance(part, ToolReturnPart) and part.tool_name == vector_search_tool_name:
                                    raw_sources_from_tool = part.content
                                    if isinstance(raw_sources_from_tool, list):
                                        logger.info(f"[PydanticAI stream] Found ToolReturnPart for '{vector_search_tool_name}' with {len(raw_sources_from_tool)} raw sources.")
                                        extracted_oc_source_nodes = [_to_source_node(s) for s in raw_sources_from_tool]
                                    else:
                                        logger.warning(f"[PydanticAI stream] ToolReturnPart for '{vector_search_tool_name}' content is not a list: {type(raw_sources_from_tool)}")
                                    break
                    if extracted_oc_source_nodes:
                        break
                
                if not extracted_oc_source_nodes:
                    logger.warning(f"[PydanticAI stream] No sources extracted from tool '{vector_search_tool_name}'. Check tool name and agent execution flow.")

                # 4. Get usage data
                usage_data = _usage_to_dict(stream_result.usage())
                logger.info(f"[PydanticAI stream] Final usage_data: {usage_data!r}")

                # 5. Finalize the LLM message in your database
                await self._finalise_llm_message(
                    llm_msg_id, 
                    final_llm_text_output,
                    extracted_oc_source_nodes, 
                    usage_data
                )

                # 6. Yield the final UnifiedStreamResponse indicating completion and including sources
                yield UnifiedStreamResponse(
                    content="",
                    accumulated_content=final_llm_text_output,
                    sources=extracted_oc_source_nodes,
                    user_message_id=user_msg_id,
                    llm_message_id=llm_msg_id,
                    is_complete=True,
                    metadata={"usage": usage_data, "framework": "pydantic_ai"},
                )
                logger.info("[PydanticAI stream] Stream finished.")

        except Exception as e:
            await self.cancel_message(llm_msg_id, f"Error in PydanticAI stream: {str(e)}")
            logger.exception(f"Error in PydanticAI stream: {e}")
            raise


def _prepare_pydantic_ai_model_settings(
    config: AgentConfig,
) -> Optional[dict[str, Any]]:
    """Helper to construct model_settings dict for PydanticAI Agent."""
    model_settings = {}
    if config.temperature is not None:
        model_settings["temperature"] = config.temperature
    if config.max_tokens is not None:
        model_settings["max_tokens"] = config.max_tokens
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
        super().__init__(
            context.config, conversation_manager, pydantic_ai_agent, agent_deps
        )
        self.context = context

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        corpus: Union[str, int, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[list[Callable]] = None,
        *,
        conversation: Optional[Conversation] = None,
        **kwargs: Any,
    ) -> "PydanticAIDocumentAgent":
        """Create a Pydantic-AI document agent tied to a specific corpus."""
        if config is None:
            config = get_default_config()

        logger.debug(
            f"Creating Pydantic-AI document agent for document {document} and corpus {corpus}"
        )
        logger.debug(f"Config (type {type(config)}): {config}")
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
            override_conversation=conversation,
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Resolve embedder_path asynchronously if not already set, otherwise this
        # is done synchronously in vector store...
        if config.embedder_path is None and context.corpus and context.corpus.id:
            logger.debug(
                f"Attempting to derive embedder_path for corpus {context.corpus.id} asynchronously."
            )
            try:
                _, resolved_embedder_path = await aget_embedder(
                    corpus_id=context.corpus.id
                )
                if resolved_embedder_path:
                    config.embedder_path = resolved_embedder_path
                    logger.debug(f"Derived embedder_path: {config.embedder_path}")
                else:
                    logger.warning(
                        f"Could not derive embedder_path for corpus {context.corpus.id}."
                    )
            except Exception as e:
                logger.warning(
                    f"Error deriving embedder_path for corpus {context.corpus.id}: {e}"
                )

        model_settings = _prepare_pydantic_ai_model_settings(config)

        # ------------------------------------------------------------------
        # Ensure a vector search tool is always available so that the agent
        # can reference the primary document and emit `sources`.
        # ------------------------------------------------------------------
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            embedder_path=config.embedder_path,
        )

        # Default vector search tool: bound method on the store. Pydantic-AI
        # will inspect the signature (query: str, k: int) and build the
        # schema automatically.
        default_vs_tool: Callable = vector_store.similarity_search

        # Merge caller-supplied tools (if any) after the default one so callers
        # can override behaviour/order if desired.
        effective_tools: list[Callable] = [default_vs_tool]
        if tools:
            effective_tools.extend(tools)

        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=effective_tools,
            model_settings=model_settings,
        )

        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            **kwargs,
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
        super().__init__(
            context.config, conversation_manager, pydantic_ai_agent, agent_deps
        )
        self.context = context

    @classmethod
    async def create(
        cls,
        corpus: Union[int, str, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[list[Callable]] = None,
        conversation: Optional[Conversation] = None,
        **kwargs,
    ) -> "PydanticAICorpusAgent":
        """Create a PydanticAI corpus agent using core functionality."""
        if config is None:
            config = get_default_config()

        if not isinstance(corpus, Corpus):  # Ensure corpus is loaded if ID is passed
            corpus_obj = await Corpus.objects.aget(id=corpus)
        else:
            corpus_obj = corpus

        context = await CoreCorpusAgentFactory.create_context(corpus_obj, config)

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_corpus(
            corpus=corpus_obj,
            user_id=config.user_id,
            config=config,
            override_conversation=conversation,
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Resolve embedder_path asynchronously if not already set
        if config.embedder_path is None and corpus_obj and corpus_obj.id:
            logger.debug(
                f"Attempting to derive embedder_path for corpus {corpus_obj.id} asynchronously."
            )
            try:
                _, resolved_embedder_path = await aget_embedder(corpus_id=corpus_obj.id)
                if resolved_embedder_path:
                    config.embedder_path = resolved_embedder_path
                    logger.debug(f"Derived embedder_path: {config.embedder_path}")
                else:
                    logger.warning(
                        f"Could not derive embedder_path for corpus {corpus_obj.id}."
                    )
            except Exception as e:
                logger.warning(
                    f"Error deriving embedder_path for corpus {corpus_obj.id}: {e}"
                )

        model_settings = _prepare_pydantic_ai_model_settings(config)

        # ------------------------------------------------------------------
        # Ensure a vector search tool is always available so that the agent
        # can reference the primary document and emit `sources`.
        # ------------------------------------------------------------------
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            embedder_path=config.embedder_path,
        )

        # Default vector search tool: bound method on the store. Pydantic-AI
        # will inspect the signature (query: str, k: int) and build the
        # schema automatically.
        default_vs_tool: Callable = vector_store.similarity_search

        # Merge caller-supplied tools (if any) after the default one so callers
        # can override behaviour/order if desired.
        effective_tools: list[Callable] = [default_vs_tool]
        if tools:
            effective_tools.extend(tools)

        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=effective_tools,
            model_settings=model_settings,
        )

        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id, corpus_id=context.corpus.id, **kwargs
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
    logger.info(f"[_usage_to_dict] Starting conversion of usage object: {usage!r}")
    
    if usage is None:  # noqa: D401 – early-exit guard
        logger.debug("[_usage_to_dict] Usage object is None, returning None")
        return None

    if hasattr(usage, "model_dump"):  # pydantic v2
        logger.info("[_usage_to_dict] Found model_dump method, using pydantic v2 conversion")
        result = usage.model_dump()  # type: ignore[arg-type]
        logger.info(f"[_usage_to_dict] Pydantic v2 conversion result: {result!r}")
        return result
        
    if dataclasses.is_dataclass(usage):  # dataclass
        logger.info("[_usage_to_dict] Object is a dataclass, using dataclasses.asdict")
        result = dataclasses.asdict(usage)
        logger.info(f"[_usage_to_dict] Dataclass conversion result: {result!r}")
        return result
        
    try:  # mapping-style object
        logger.info("[_usage_to_dict] Attempting dict() conversion")
        result = dict(usage)  # type: ignore[arg-type]
        logger.info(f"[_usage_to_dict] Dict conversion result: {result!r}")
        return result
    except Exception as e:  # pragma: no cover
        logger.info(f"[_usage_to_dict] Dict conversion failed with error: {e!r}, falling back to vars()")
        result = vars(usage)
        logger.info(f"[_usage_to_dict] Vars() fallback result: {result!r}")
        return result
