"""Clean PydanticAI implementation following PydanticAI patterns."""

import dataclasses
import logging
from collections.abc import AsyncGenerator
from typing import Any, Callable, Optional, Union

import pydantic_core
from pydantic_ai.agent import Agent as PydanticAIAgent
from pydantic_ai.agent import (
    CallToolsNode,
    End,
    ModelRequestNode,
    UserPromptNode,
)
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    SystemPromptPart,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    UserPromptPart,
)

from opencontractserver.conversations.models import Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    ContentEvent,
    CoreAgentBase,
    CoreConversationManager,
    CoreCorpusAgentFactory,
    CoreDocumentAgentFactory,
    CorpusAgentContext,
    DocumentAgentContext,
    FinalEvent,
    SourceEvent,
    SourceNode,
    ThoughtEvent,
    UnifiedChatResponse,
    UnifiedStreamEvent,
    get_default_config,
)
from opencontractserver.llms.agents.timeline_stream_mixin import TimelineStreamMixin
from opencontractserver.llms.tools.core_tools import (
    aadd_document_note,
    aget_corpus_description,
    aget_md_summary_token_length,
    aget_notes_for_document_corpus,
    aload_document_md_summary,
    aload_document_txt_extract,
    asearch_document_notes,
    aupdate_corpus_description,
    aupdate_document_note,
)
from opencontractserver.llms.tools.pydantic_ai_tools import (
    PydanticAIDependencies,
    PydanticAIToolFactory,
)
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
)
from opencontractserver.utils.embeddings import aget_embedder

from .timeline_schema import TimelineEntry

logger = logging.getLogger(__name__)


def _to_source_node(raw: Any) -> SourceNode:
    """
    Convert an item coming from pydantic-ai (dict or BaseModel) to
    our framework-agnostic SourceNode.
    """
    if isinstance(raw, SourceNode):  # already normalised
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


# ---------------------------------------------------------------------------
# Pydantic‐AI base – now inherits TimelineStreamMixin for unified timeline.
# ---------------------------------------------------------------------------


class PydanticAICoreAgent(TimelineStreamMixin, CoreAgentBase):
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
        timeline: list[TimelineEntry],
    ) -> None:
        """Finalize LLM message with content, sources, and metadata."""
        await self.complete_message(
            llm_id,
            final_content,
            sources=sources,
            metadata={"usage": usage, "framework": "pydantic_ai", "timeline": timeline},
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

            timeline: list[TimelineEntry] = []  # For reconstructing reasoning chain

            # Finalize the message atomically
            await self._finalise_llm_message(
                llm_msg_id, llm_response_content, sources, usage_data, timeline
            )

            return UnifiedChatResponse(
                content=llm_response_content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"usage": usage_data, "timeline": timeline},
            )
        except Exception as e:
            # Cancel placeholder message on error
            await self.cancel_message(llm_msg_id, f"Error: {str(e)}")
            logger.exception(f"Error in PydanticAI chat: {e}")
            raise

    # NOTE: This method was previously called ``stream``.  It is now renamed
    # to ``_stream_core`` so that the TimelineStreamMixin can wrap it and take
    # care of collecting the reasoning timeline.

    async def _stream_core(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:
        """Internal streaming generator – TimelineStreamMixin adds timeline."""

        logger.info(f"[PydanticAI stream] Starting stream with message: {message!r}")

        user_msg_id, llm_msg_id = await self._initialise_llm_message(message)

        accumulated_content: str = ""
        accumulated_sources: list[SourceNode] = []
        final_usage_data: dict[str, Any] | None = None

        # Re-hydrate the historical context for Pydantic-AI, if any exists.
        message_history = await self._get_message_history()

        stream_kwargs: dict[str, Any] = {"deps": self.agent_deps}
        if message_history:
            stream_kwargs["message_history"] = message_history
        stream_kwargs.update(kwargs)

        try:
            async with self.pydantic_ai_agent.iter(
                message, **stream_kwargs
            ) as agent_run:
                async for node in agent_run:

                    # ------------------------------------------------------------------
                    # USER PROMPT NODE – This is the very first node in the graph.
                    # ------------------------------------------------------------------
                    if isinstance(node, UserPromptNode):
                        yield ThoughtEvent(
                            thought="Received user prompt; beginning reasoning cycle…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )

                    # ------------------------------------------------------------------
                    # MODEL REQUEST NODE – We can stream raw model deltas from here.
                    # ------------------------------------------------------------------
                    elif isinstance(node, ModelRequestNode):
                        yield ThoughtEvent(
                            thought="Sending request to language model…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )

                        async with node.stream(agent_run.ctx) as model_stream:
                            async for event in model_stream:
                                text, is_answer, meta = _event_to_text_and_meta(event)
                                if text:
                                    if is_answer:
                                        accumulated_content += text
                                        # Content timeline now handled by TimelineStreamMixin

                                    # Merge any source nodes attached to event (unlikely here but future-proof)
                                    accumulated_sources.extend(
                                        [
                                            _to_source_node(s)
                                            for s in getattr(event, "sources", [])
                                        ]
                                    )
                                    # builder will record Sources automatically

                                    yield ContentEvent(
                                        content=text,
                                        accumulated_content=accumulated_content,
                                        user_message_id=user_msg_id,
                                        llm_message_id=llm_msg_id,
                                        metadata=meta,
                                    )

                    # ------------------------------------------------------------------
                    # CALL TOOLS NODE – Capture tool call & result events.
                    # ------------------------------------------------------------------
                    elif isinstance(node, CallToolsNode):
                        yield ThoughtEvent(
                            thought="Processing model response – may invoke tools…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )

                        async with node.stream(agent_run.ctx) as tool_stream:
                            async for event in tool_stream:
                                if event.event_kind == "function_tool_call":
                                    yield ThoughtEvent(
                                        thought=f"Calling tool `{event.part.tool_name}` with args {event.part.args}",
                                        user_message_id=user_msg_id,
                                        llm_message_id=llm_msg_id,
                                        metadata={
                                            "tool_name": event.part.tool_name,
                                            "args": event.part.args,
                                        },
                                    )
                                    # builder will record tool thought events via emits

                                elif event.event_kind == "function_tool_result":
                                    tool_name = event.result.tool_name  # type: ignore[attr-defined]
                                    # Capture vector-search results (our canonical source provider)
                                    if tool_name == "similarity_search":
                                        raw_sources = event.result.content  # type: ignore[attr-defined]
                                        if isinstance(raw_sources, list):
                                            new_sources = [
                                                _to_source_node(s) for s in raw_sources
                                            ]
                                            accumulated_sources.extend(new_sources)
                                            # Emit a dedicated SourceEvent so the client
                                            # can update citations in real-time.
                                            yield SourceEvent(
                                                sources=new_sources,
                                                user_message_id=user_msg_id,
                                                llm_message_id=llm_msg_id,
                                            )

                                    else:
                                        yield ThoughtEvent(
                                            thought=f"Tool `{tool_name}` returned a result.",
                                            user_message_id=user_msg_id,
                                            llm_message_id=llm_msg_id,
                                            metadata={"tool_name": tool_name},
                                        )
                                        # builder handles thought

                    # ------------------------------------------------------------------
                    # END NODE – Execution graph is finished.
                    # ------------------------------------------------------------------
                    elif isinstance(node, End):
                        yield ThoughtEvent(
                            thought="Run finished; aggregating final results…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )

                # After exiting the for-loop, the agent_run is complete and contains the final result.
                if agent_run.result:
                    accumulated_content = str(agent_run.result.output)
                    final_usage_data = _usage_to_dict(agent_run.result.usage())
                    # builder will add run_finished status

            # Emit final event – TimelineStreamMixin will take care of metadata
            yield FinalEvent(
                accumulated_content=accumulated_content,
                sources=accumulated_sources,
                metadata={
                    "usage": final_usage_data,
                    "framework": "pydantic_ai",
                },
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                content="",  # kept empty
            )

        except Exception as e:
            await self.cancel_message(llm_msg_id, f"Error: {str(e)}")
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

        # -----------------------------
        # Document-specific async tools
        # -----------------------------
        async def load_document_summary_tool(
            truncate_length: int | None = None,
            from_start: bool = True,
        ) -> str:
            """Load the document's markdown summary (optionally truncated)."""
            return await aload_document_md_summary(
                context.document.id, truncate_length, from_start
            )

        async def get_summary_token_length_tool() -> int:
            """Return token length of the document's markdown summary."""
            return await aget_md_summary_token_length(context.document.id)

        async def get_document_notes_tool() -> list[dict[str, Any]]:
            """Retrieve metadata & first 512-char preview of notes for this document."""
            return await aget_notes_for_document_corpus(
                context.document.id, context.corpus.id
            )

        async def load_document_text_tool(
            start: int | None = None,
            end: int | None = None,
            refresh: bool = False,
        ) -> str:
            """Return a slice of the document's plain-text extract."""
            return await aload_document_txt_extract(
                context.document.id, start, end, refresh=refresh
            )

        # Wrap with PydanticAI factory
        load_summary_tool = PydanticAIToolFactory.from_function(
            load_document_summary_tool,
            name="load_document_summary",
            description="Load the markdown summary of the document. Optionally truncate by length and direction.",
            parameter_descriptions={
                "truncate_length": "Optional number of characters to truncate the summary to",
                "from_start": "If True, truncate from start; if False, truncate from end",
            },
        )

        get_summary_length_tool = PydanticAIToolFactory.from_function(
            get_summary_token_length_tool,
            name="get_summary_token_length",
            description="Get the approximate token length of the document's markdown summary.",
        )

        get_notes_tool = PydanticAIToolFactory.from_function(
            get_document_notes_tool,
            name="get_document_notes",
            description="Retrieve all notes attached to this document in the current corpus.",
        )

        load_text_tool = PydanticAIToolFactory.from_function(
            load_document_text_tool,
            name="load_document_text",
            description="Load the document's plain-text extract (full or partial).",
            parameter_descriptions={
                "start": "Inclusive start character index (default 0)",
                "end": "Exclusive end character index (defaults to end of file)",
                "refresh": "If true, refresh the cached content from disk",
            },
        )

        # -----------------------------
        # New note manipulation tools
        # -----------------------------

        async def add_document_note_tool(title: str, content: str) -> dict[str, int]:
            """Create a new note attached to this document and return its id."""
            note = await aadd_document_note(
                document_id=context.document.id,
                title=title,
                content=content,
                creator_id=config.user_id,
                corpus_id=context.corpus.id,
            )
            return {"note_id": note.id}

        async def update_document_note_tool(
            note_id: int, new_content: str
        ) -> dict[str, int | None]:
            """Version-up an existing note and return new version number."""
            rev = await aupdate_document_note(
                note_id=note_id,
                new_content=new_content,
                author_id=config.user_id,
            )
            version = rev.version if rev else None
            return {"version": version}

        async def search_document_notes_tool(
            search_term: str, limit: int | None = None
        ):
            """Search notes attached to this document for a keyword."""
            return await asearch_document_notes(
                document_id=context.document.id,
                search_term=search_term,
                corpus_id=context.corpus.id,
                limit=limit,
            )

        add_note_tool_wrapped = PydanticAIToolFactory.from_function(
            add_document_note_tool,
            name="add_document_note",
            description="Create a new note attached to the current document in this corpus.",
            parameter_descriptions={
                "title": "Title of the note",
                "content": "Full markdown content of the note",
            },
        )

        update_note_tool_wrapped = PydanticAIToolFactory.from_function(
            update_document_note_tool,
            name="update_document_note",
            description="Update an existing note's content, creating a new revision.",
            parameter_descriptions={
                "note_id": "ID of the note to update",
                "new_content": "New note content (markdown)",
            },
        )

        search_notes_tool_wrapped = PydanticAIToolFactory.from_function(
            search_document_notes_tool,
            name="search_document_notes",
            description="Search notes for a keyword (title or content)",
            parameter_descriptions={
                "search_term": "Keyword or phrase to search for (case-insensitive)",
                "limit": "Maximum number of results to return",
            },
        )

        # Merge caller-supplied tools (if any) after the default one so callers
        # can override behaviour/order if desired.
        effective_tools: list[Callable] = [
            default_vs_tool,
            load_summary_tool,
            get_summary_length_tool,
            get_notes_tool,
            load_text_tool,
            add_note_tool_wrapped,
            update_note_tool_wrapped,
            search_notes_tool_wrapped,
        ]
        if tools:
            effective_tools.extend(tools)

        logger.info(f"Created pydantic ai agent with context {config.system_prompt}")
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

        # -----------------------------
        # Corpus description tools
        # -----------------------------

        async def get_corpus_description_tool(
            truncate_length: int | None = None,
            from_start: bool = True,
        ) -> str:
            """Return the current corpus markdown description (optionally truncated)."""
            return await aget_corpus_description(
                corpus_id=context.corpus.id,
                truncate_length=truncate_length,
                from_start=from_start,
            )

        async def update_corpus_description_tool(
            new_content: str,
        ) -> dict[str, int | None]:
            """Update the corpus description and return new version number (if changed)."""
            rev = await aupdate_corpus_description(
                corpus_id=context.corpus.id,
                new_content=new_content,
                author_id=config.user_id,
            )
            version = rev.version if rev else None
            return {"version": version}

        get_corpus_desc_tool_wrapped = PydanticAIToolFactory.from_function(
            get_corpus_description_tool,
            name="get_corpus_description",
            description="Retrieve the latest markdown description for this corpus.",
            parameter_descriptions={
                "truncate_length": "Optionally truncate the description to this many characters",
                "from_start": "If true, truncate from beginning else from end",
            },
        )

        update_corpus_desc_tool_wrapped = PydanticAIToolFactory.from_function(
            update_corpus_description_tool,
            name="update_corpus_description",
            description="Update corpus description with new markdown text, creating a revision if changed.",
            parameter_descriptions={
                "new_content": "Full markdown content",
            },
        )

        # Merge caller-supplied tools (if any) after the default one so callers
        # can override behaviour/order if desired.
        effective_tools: list[Callable] = [
            default_vs_tool,
            get_corpus_desc_tool_wrapped,
            update_corpus_desc_tool_wrapped,
        ]
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
# helpers – rich‐event extraction                                            #
# --------------------------------------------------------------------------- #


def _event_to_text_and_meta(event: Any) -> tuple[str, bool, dict[str, Any]]:
    """Convert a *model* stream event (PartStart/Delta) to `(text, is_answer, meta)`.

    Args:
        event: The incoming event from `node.stream()`.

    Returns:
        text: ``str`` representation – empty if nothing user-visible.
        is_answer: ``True`` if this text counts towards the assistant's final
                   answer (i.e. *only* TextPart/Delta).
        meta: Any additional metadata extracted (e.g. tool name & args).
    """

    text: str = ""
    is_answer = False
    meta: dict[str, Any] = {}

    if isinstance(event, PartStartEvent):
        part = event.part
    elif isinstance(event, PartDeltaEvent):
        part = event.delta
    else:
        return text, is_answer, meta  # unsupported event

    # ------------------------------------------------------------------
    # Full parts
    # ------------------------------------------------------------------
    if isinstance(part, TextPart):
        text = part.content
        is_answer = True
    elif isinstance(part, ToolCallPart):
        args_display = (
            part.args
            if isinstance(part.args, str)
            else (
                part.args_as_json_str()
                if hasattr(part, "args_as_json_str")
                else str(part.args)
            )
        )
        text = f"{part.tool_name}({args_display})"
        meta = {"tool_name": part.tool_name, "args": part.args}

    # ------------------------------------------------------------------
    # Deltas – incremental pieces
    # ------------------------------------------------------------------
    elif isinstance(part, TextPartDelta):
        text = part.content_delta
        is_answer = True
    elif isinstance(part, ToolCallPartDelta):
        # Build incremental readable description if possible
        tool_name_inc = part.tool_name_delta or ""
        if isinstance(part.args_delta, str):
            args_inc = part.args_delta
        elif isinstance(part.args_delta, dict):
            args_inc = pydantic_core.to_json(part.args_delta).decode()
        else:
            args_inc = ""
        text = f"{tool_name_inc}({args_inc})" if tool_name_inc or args_inc else ""
        meta = {
            "tool_name_delta": part.tool_name_delta,
            "args_delta": part.args_delta,
        }

    return text, is_answer, meta


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
        logger.info(
            "[_usage_to_dict] Found model_dump method, using pydantic v2 conversion"
        )
        result = usage.model_dump()  # type: ignore[arg-type]
        logger.info(f"[_usage_to_dict] Pydantic v2 conversion result: {result!r}")
        return result

    if dataclasses.is_dataclass(usage):  # dataclass
        logger.info("[_usage_to_dict] Object is a dataclass, using dataclasses.asdict")
        result = dataclasses.asdict(usage)
        logger.info(f"[_usage_to_dict] Dataclass conversion result: {result!r}")
        return result

    logger.warning(
        f"[_usage_to_dict] No conversion method found for usage object: {usage!r}"
    )
    return None
