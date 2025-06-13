"""Core agent functionality independent of any specific agent framework."""

import logging
from abc import ABC
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Protocol, Union, runtime_checkable

from django.conf import settings
from django.utils import timezone

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
)
from opencontractserver.utils.embeddings import aget_embedder

logger = logging.getLogger(__name__)


class MessageState:
    """Constants for message states."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"
    AWAITING_APPROVAL = "awaiting_approval"


@dataclass
class SourceNode:
    """Framework-agnostic representation of a source node with metadata."""

    annotation_id: int
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    similarity_score: float = 1.0

    @classmethod
    def from_annotation(cls, annotation, similarity_score: float = 1.0) -> "SourceNode":
        """Create a SourceNode from an Annotation object."""
        return cls(
            annotation_id=annotation.id,
            content=annotation.raw_text,
            metadata={
                "annotation_id": annotation.id,
                "document_id": annotation.document_id,
                "corpus_id": annotation.corpus_id,
                "page": annotation.page,
                "annotation_label": (
                    annotation.annotation_label.text
                    if annotation.annotation_label
                    else None
                ),
            },
            similarity_score=similarity_score,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for storage in message data."""
        # Flatten metadata to top level and include similarity_score
        # This mirrors the WebSocket transmission format for consistency
        result = {
            "annotation_id": self.annotation_id,
            "rawText": self.content,  # Frontend expects rawText
            "similarity_score": self.similarity_score,
            **self.metadata,  # Flatten all metadata fields to top level
        }
        return result


@dataclass
class UnifiedChatResponse:
    """Framework-agnostic chat response with sources and metadata."""

    content: str
    sources: list[SourceNode] = field(default_factory=list)
    user_message_id: Optional[int] = None
    llm_message_id: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# DRY helper – shared fields for every streamed event                         #
# --------------------------------------------------------------------------- #


@dataclass
class _BaseStreamEvt:
    """Common fields shared by *all* stream-event dataclasses (old & new)."""

    # Legacy / convenience fields so consumers can treat every event the same
    content: str = ""
    accumulated_content: str = ""
    sources: list[SourceNode] = field(default_factory=list)
    user_message_id: Optional[int] = None
    llm_message_id: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    is_complete: bool = False


# ------------------------------------------------------------------
# Concrete event types
# ------------------------------------------------------------------


@dataclass
class ThoughtEvent(_BaseStreamEvt):
    """An intermediate reasoning step emitted while the agent is running."""

    type: Literal["thought"] = "thought"
    thought: str = ""


@dataclass
class ContentEvent(_BaseStreamEvt):
    """A delta (token or chunk) of the assistant's final textual answer."""

    type: Literal["content"] = "content"


@dataclass
class SourceEvent(_BaseStreamEvt):
    """One or more sources discovered during the agent run."""

    type: Literal["sources"] = "sources"


@dataclass
class FinalEvent(_BaseStreamEvt):
    """The final, complete event – always the last one."""

    type: Literal["final"] = "final"
    is_complete: bool = True


# ------------------------------------------------------------------
# Approval gating – emitted when execution pauses for human approval.
# ------------------------------------------------------------------


@dataclass
class ApprovalNeededEvent(_BaseStreamEvt):
    """Stream event indicating the agent is waiting for tool approval."""

    type: Literal["approval_needed"] = "approval_needed"
    pending_tool_call: dict[str, Any] = field(default_factory=dict)


# A discriminated union over all event types. The Literal strings defined in each
# dataclass act as simple runtime markers that make it easy for downstream code
# (e.g. WebSocket serializers) to switch on the `.type` attribute without costly
# ``isinstance`` checks.
UnifiedStreamEvent = Union[
    ThoughtEvent,
    ContentEvent,
    SourceEvent,
    ApprovalNeededEvent,
    FinalEvent,
]


@dataclass
class UnifiedStreamResponse:
    """Framework-agnostic streaming response chunk."""

    content: str
    accumulated_content: str = ""
    sources: list[SourceNode] = field(default_factory=list)
    user_message_id: Optional[int] = None
    llm_message_id: Optional[int] = None
    is_complete: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentConfig:
    """Framework-agnostic agent configuration with enhanced conversation management."""

    # Basic configuration
    user_id: Optional[int] = None
    model_name: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    embedder_path: Optional[str] = None
    similarity_top_k: int = 10
    streaming: bool = True
    verbose: bool = True
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    # NEW ➜ frequency (in tokens) for interim DB updates during streaming
    stream_update_freq: int = 50

    # Enhanced conversation management
    conversation: Optional[Conversation] = None
    conversation_id: Optional[int] = None
    loaded_messages: Optional[list[ChatMessage]] = None
    store_user_messages: bool = True
    store_llm_messages: bool = True

    # Tool configuration
    tools: list[Any] = field(default_factory=list)


@dataclass
class DocumentAgentContext:
    """Context for document-specific agents."""

    corpus: Corpus
    document: Document
    config: AgentConfig
    vector_store: Optional[CoreAnnotationVectorStore] = None

    def __post_init__(self):
        """Initialize vector store if not provided."""
        if self.vector_store is None:
            self.vector_store = CoreAnnotationVectorStore(
                user_id=self.config.user_id,
                document_id=self.document.id,
                corpus_id=self.corpus.id,
                embedder_path=self.config.embedder_path,
            )


@dataclass
class CorpusAgentContext:
    """Context for corpus-specific agents."""

    corpus: Corpus
    config: AgentConfig
    documents: Optional[list[Document]] = None

    async def __post_init__(self):
        """Initialize documents list if not provided."""
        if self.documents is None:
            self.documents = [doc async for doc in self.corpus.documents.all()]


@runtime_checkable
class CoreAgent(Protocol):
    """Enhanced protocol defining the interface for framework-agnostic agents."""

    # Core conversation methods
    async def chat(self, message: str, **kwargs) -> UnifiedChatResponse:
        """Send a message and get a complete response with sources."""
        ...

    async def stream(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:
        """Send a message and receive a typed stream of events (thoughts, content, sources, final)."""
        ...

    # Message management methods
    async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
        """Create a placeholder message and return its ID."""
        ...

    async def update_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Update a stored message with content, sources, and metadata."""
        ...

    async def complete_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Complete a message atomically with content, sources, and metadata."""
        ...

    async def cancel_message(self, message_id: int, reason: str = "Cancelled") -> None:
        """Cancel a placeholder message."""
        ...

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        ...

    async def store_llm_message(
        self,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> int:
        """Store an LLM message in the conversation."""
        ...

    # Conversation metadata methods
    def get_conversation_id(self) -> Optional[int]:
        """Get the current conversation ID for session continuity."""
        ...

    def get_conversation_info(self) -> dict[str, Any]:
        """Get conversation metadata including ID, title, and user info."""
        ...

    async def get_conversation_messages(self) -> list[ChatMessage]:
        """Get all messages in the current conversation."""
        ...

    # ------------------------------------------------------------------
    # Human-in-the-loop: approve / resume
    # ------------------------------------------------------------------

    async def resume_with_approval(
        self,
        llm_message_id: int,
        approved: bool,
        **kwargs,
    ) -> Union[UnifiedChatResponse, AsyncGenerator[UnifiedStreamEvent, None]]:
        """Resume a paused conversation after an approval decision.

        Args:
            llm_message_id: The message that is currently *awaiting* approval.
            approved: ``True`` if the user approved execution; ``False`` if
                rejected.
            **kwargs: Forwarded to the underlying ``chat`` / ``stream``.
        """
        ...


class CoreAgentBase(ABC):
    """Base implementation of CoreAgent with common functionality.

    Sub-classes **must** implement the framework-specific low-level hooks

        async def _chat_raw(self, message: str, **kw) -> tuple[str, list[SourceNode], dict]:
        async def _stream_raw(self, message: str, **kw) -> AsyncGenerator[UnifiedStreamEvent, None]:

    All DB-persistence, approval gating and incremental message updates are
    handled by the concrete ``chat`` / ``stream`` wrappers defined here.
    """

    def __init__(
        self, config: AgentConfig, conversation_manager: "CoreConversationManager"
    ):
        self.config = config
        self.conversation_manager = conversation_manager

    async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
        """Create a placeholder message and return its ID."""
        return await self.conversation_manager.create_placeholder_message(msg_type)

    async def update_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Update a stored message with content, sources, and metadata."""
        if metadata and "timeline" not in metadata:
            metadata["timeline"] = []
        await self.conversation_manager.update_message(
            message_id, content, sources, metadata
        )

    async def complete_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Complete a message atomically with content, sources, and metadata."""
        await self.conversation_manager.complete_message(
            message_id, content, sources, metadata
        )

    async def cancel_message(self, message_id: int, reason: str = "Cancelled") -> None:
        """Cancel a placeholder message."""
        await self.conversation_manager.cancel_message(message_id, reason)

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)

    async def store_llm_message(
        self,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(
            content, sources, metadata
        )

    def get_conversation_id(self) -> Optional[int]:
        """Get the current conversation ID for session continuity."""
        return (
            self.conversation_manager.conversation.id
            if self.conversation_manager.conversation
            else None
        )

    def get_conversation_info(self) -> dict[str, Any]:
        """Get conversation metadata including ID, title, and user info."""
        if not self.conversation_manager.conversation:
            return {"conversation_id": None, "title": None, "user_id": None}

        conv = self.conversation_manager.conversation
        return {
            "conversation_id": conv.id,
            "title": conv.title,
            "user_id": self.conversation_manager.user_id,
            "created": conv.created.isoformat() if conv.created else None,
            "description": conv.description,
        }

    async def get_conversation_messages(self) -> list[ChatMessage]:
        """Get all messages in the current conversation."""
        return await self.conversation_manager.get_conversation_messages()

    # Legacy compatibility methods
    async def stream_chat(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:
        """Legacy compatibility wrapper that simply forwards to ``stream`` and yields its events."""
        async for chunk in self.stream(message, **kwargs):
            yield chunk

    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Legacy method - delegates to appropriate store method."""
        if msg_type.upper() == "USER":
            return await self.store_user_message(content)
        else:
            return await self.store_llm_message(content)

    # ------------------------------------------------------------------
    # Framework-specific hooks – **must** be implemented by adapters.
    # ------------------------------------------------------------------

    async def _chat_raw(
        self, message: str, **kwargs
    ) -> tuple[str, list[SourceNode], dict]:  # pragma: no cover – abstract
        """Return *(content, sources, metadata)*.

        Default implementation raises ``NotImplementedError`` so sub-classes
        are forced to provide their own version.
        """
        raise NotImplementedError

    async def _stream_raw(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:  # pragma: no cover – abstract
        """Yield framework-native events (ThoughtEvent / ContentEvent / …).

        The base wrapper will take care of DB side-effects.
        """
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Public chat / stream wrappers – universal across frameworks.
    # ------------------------------------------------------------------

    async def chat(self, message: str, **kwargs) -> UnifiedChatResponse:  # type: ignore[override]
        """Framework-agnostic chat wrapper that transparently persists state."""

        from opencontractserver.llms.exceptions import ToolConfirmationRequired

        # Honour per-call override for message persistence
        store_messages: bool = kwargs.pop("store_messages", True)

        # 1️⃣  Persist user prompt (if configured)
        user_msg_id: int | None = None
        llm_msg_id: int | None = None

        if store_messages and self.conversation_manager.config.store_user_messages:
            user_msg_id = await self.store_user_message(message)

        if store_messages and self.conversation_manager.config.store_llm_messages:
            llm_msg_id = await self.create_placeholder_message("LLM")

        try:
            # 2️⃣  Delegate to framework
            content, sources, meta = await self._chat_raw(message, **kwargs)

            # 3️⃣  Finalise message
            if llm_msg_id:
                await self.complete_message(llm_msg_id, content, sources, meta)

            return UnifiedChatResponse(
                content=content,
                sources=sources,
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata=meta or {},
            )

        except ToolConfirmationRequired as e:
            # Mark message as awaiting approval and bubble up light response
            if llm_msg_id is None:
                # We may reach here if placeholder wasn't created (anonymous?), create one now
                llm_msg_id = await self.create_placeholder_message("LLM")

            await self.pause_for_approval(
                llm_msg_id,
                tool_name=e.tool_name,
                tool_args=e.tool_args,
                tool_call_id=e.tool_call_id,
            )

            return UnifiedChatResponse(
                content="Action required: approval needed to run tool.",
                sources=[],
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={
                    "state": MessageState.AWAITING_APPROVAL,
                    "pending_tool_call": {
                        "name": e.tool_name,
                        "arguments": e.tool_args,
                        "tool_call_id": e.tool_call_id,
                    },
                },
            )

        except Exception as exc:
            if llm_msg_id:
                await self.cancel_message(llm_msg_id, f"Error: {exc}")
            raise

    # NOTE: Streaming wrapper is more involved but follows same pattern
    async def stream(self, message: str, **kwargs):  # type: ignore[override]
        """Framework-agnostic streaming wrapper with persistence."""

        from opencontractserver.llms.exceptions import ToolConfirmationRequired

        store_messages: bool = kwargs.pop("store_messages", True)

        user_msg_id: int | None = None
        llm_msg_id: int | None = None

        if store_messages and self.conversation_manager.config.store_user_messages:
            user_msg_id = await self.store_user_message(message)

        if store_messages and self.conversation_manager.config.store_llm_messages:
            llm_msg_id = await self.create_placeholder_message("LLM")

        accumulated_content: str = ""
        accumulated_sources: list[SourceNode] = []
        token_counter = 0

        try:
            async for evt in self._stream_raw(message, **kwargs):

                # Merge sources for later finalisation
                if hasattr(evt, "sources") and evt.sources:
                    accumulated_sources.extend(evt.sources)

                # Track accumulating content for incremental updates
                if hasattr(evt, "content") and evt.content:
                    accumulated_content += evt.content
                    token_counter += 1

                # Periodic DB update
                if (
                    llm_msg_id
                    and token_counter % self.config.stream_update_freq == 0
                    and accumulated_content
                ):
                    await self.conversation_manager.update_message_content(
                        llm_msg_id, accumulated_content
                    )

                yield evt  # Pass through

            # After generator exhausted – finalise message
            if llm_msg_id:
                await self.complete_message(
                    llm_msg_id,
                    accumulated_content,
                    accumulated_sources,
                    {},
                )

        except ToolConfirmationRequired as e:
            # Finalise as awaiting approval and emit ApprovalNeededEvent
            await self.pause_for_approval(
                llm_msg_id,
                tool_name=e.tool_name,
                tool_args=e.tool_args,
                tool_call_id=e.tool_call_id,
            )

            yield ApprovalNeededEvent(
                pending_tool_call={
                    "name": e.tool_name,
                    "arguments": e.tool_args,
                    "tool_call_id": e.tool_call_id,
                },
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
            )

        except Exception as exc:
            if llm_msg_id:
                await self.cancel_message(llm_msg_id, f"Error: {exc}")
            raise

    # ------------------------------------------------------------------
    # Helper for lightweight source normalisation (framework-agnostic)
    # ------------------------------------------------------------------
    @staticmethod
    def _normalise_source(raw: Any) -> SourceNode:
        """Best-effort conversion of *raw* into a SourceNode instance."""
        if isinstance(raw, SourceNode):
            return raw

        # Attempt to treat *raw* like a mapping
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump()
        if isinstance(raw, dict):
            return SourceNode(
                annotation_id=int(raw.get("annotation_id", 0)),
                content=raw.get("content", raw.get("text", "")),
                metadata=raw,
                similarity_score=float(raw.get("similarity_score", 1.0)),
            )

        # Fallback: string or unknown – wrap in dummy SourceNode
        return SourceNode(
            annotation_id=0, content=str(raw), metadata={}, similarity_score=1.0
        )

    # ------------------------------------------------------------------
    # Human-in-the-loop helpers
    # ------------------------------------------------------------------

    async def pause_for_approval(
        self,
        llm_message_id: int,
        *,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_call_id: str | None = None,
        framework: str = "pydantic_ai",
    ) -> None:
        """Mark an LLM message as *awaiting approval*.

        Adapters that implement dangerous or privileged tools can call this
        one-liner instead of re-implementing the same bookkeeping.
        """
        await self.complete_message(
            llm_message_id,
            content="Awaiting user approval for tool execution.",
            metadata={
                "state": MessageState.AWAITING_APPROVAL,
                "pending_tool_call": {
                    "name": tool_name,
                    "arguments": tool_args,
                    "tool_call_id": tool_call_id,
                },
                "framework": framework,
            },
        )


class CoreDocumentAgentFactory:
    """Factory for creating document agents with framework-agnostic configuration."""

    @staticmethod
    def get_default_system_prompt(document: Document) -> str:
        """Generate default system prompt for document agent."""
        return (
            f"You are an expert assistant for document analysis and interpretation. "
            f"Your primary goal is to answer questions accurately based on document '{document.title}' (ID: {document.id}).\n\n"  # noqa: E501
            f"This document is described as:\n`{document.description}`\n\n"
            f"**Available Tools:**\n"
            f"You have access to a comprehensive set of tools for document analysis:\n\n"
            f"1. **Vector Search**: A sophisticated semantic search engine that finds text passages similar to your queries.\n"  # noqa: E501
            f"2. **Document Summary Access**: Tools to load and analyze the document's markdown summary, including:\n"
            f"   - Loading full or truncated summary content\n"
            f"   - Calculating token lengths for context management\n"
            f"3. **Notes Analysis**: Tools to retrieve and examine notes attached to this document:\n"
            f"   - Listing all notes with metadata\n"
            f"   - Accessing specific note content\n"
            f"   - Calculating note token lengths\n\n"
            f"**Important**: Always check what tools are available to you, as additional specialized tools may be provided dynamically "  # noqa: E501
            f"beyond the core set described above. Use the appropriate tools to gather information before answering.\n\n"  # noqa: E501
            f"**Guidelines:**\n"
            f"- Prioritize information retrieved directly from the document using these tools\n"
            f"- We intentionally did not give you the entire document initially. \n"
            "  Try doing some vector search to get more information initially and then iteratively \n"
            "  identifying which parts of the document to review.  \n"
            f"- Do not rely solely on the summary or your general knowledge\n"
            f"- Use multiple tools when necessary for comprehensive answers\n"
            f"- Present your findings in clear, helpful markdown format\n"
            f"- Avoid repeating instructions or disclaimers in your responses"
        )

    @staticmethod
    async def create_context(
        document: Union[str, int, Document],
        corpus: Union[str, int, Corpus],
        config: AgentConfig,
    ) -> DocumentAgentContext:
        """Create document agent context with all necessary components."""
        if not isinstance(document, Document):
            document = await Document.objects.aget(id=document)

        if not isinstance(corpus, Corpus):
            corpus = await Corpus.objects.aget(id=corpus)

        # ------------------------------------------------------------------
        # Ensure an embedder is configured (async!).
        # ------------------------------------------------------------------
        if config.embedder_path is None:
            _, name = await aget_embedder(corpus.id)
            config.embedder_path = name

        # Set default system prompt if not provided
        if config.system_prompt is None:
            config.system_prompt = CoreDocumentAgentFactory.get_default_system_prompt(
                document
            )

        return DocumentAgentContext(corpus=corpus, document=document, config=config)


class CoreCorpusAgentFactory:
    """Factory for creating corpus agents with framework-agnostic configuration."""

    @staticmethod
    def get_default_system_prompt(corpus: Corpus) -> str:
        """Generate default system prompt for corpus agent."""
        return (
            f"You are an expert assistant designed to analyze and answer queries about a collection of documents "
            f"called '{corpus.title}'.\n\n"
            f"**Available Tools:**\n"
            f"You have access to comprehensive tools for analyzing documents in this corpus:\n\n"
            f"1. **Document-Specific Tools**: Each document in the corpus has its own set of tools including:\n"
            f"   - Vector search for semantic similarity matching within documents\n"
            f"   - Document summary loading and analysis\n"
            f"   - Notes retrieval and examination\n"
            f"   - Token length calculations for context management\n"
            f"2. **Cross-Document Analysis**: Tools that work across the entire corpus for comprehensive answers\n\n"
            f"**Important**: Always check what tools are available to you, as additional specialized tools may be provided dynamically "  # noqa: E501
            f"beyond the core set. The exact tools available will depend on the documents in this corpus.\n\n"
            f"**Guidelines:**\n"
            f"- Always use the provided tools to gather information before answering\n"
            f"- Do not rely on prior knowledge about the documents\n"
            f"- When appropriate, search across multiple documents for comprehensive answers\n"
            f"- Cite specific documents and sources when presenting information\n"
            f"- Present your findings in clear, well-structured markdown format"
        )

    @staticmethod
    async def create_context(
        corpus: Union[str, int, Corpus],
        config: AgentConfig,
    ) -> CorpusAgentContext:
        """Create corpus agent context with all necessary components."""
        if not isinstance(corpus, Corpus):
            corpus = await Corpus.objects.aget(id=corpus)

        documents = [doc async for doc in corpus.documents.all()]

        # Set default system prompt if not provided
        if config.system_prompt is None:
            config.system_prompt = CoreCorpusAgentFactory.get_default_system_prompt(
                corpus
            )

        # Use corpus preferred embedder if not specified
        if config.embedder_path is None:
            config.embedder_path = corpus.preferred_embedder

        context = CorpusAgentContext(corpus=corpus, config=config, documents=documents)
        await context.__post_init__()
        return context


class CoreConversationManager:
    """Enhanced conversation manager with full message lifecycle support and atomic operations."""

    def __init__(
        self,
        conversation: Optional[Conversation],
        user_id: Optional[int],
        config: AgentConfig,
    ):
        self.conversation = conversation
        self.user_id = user_id
        self.config = config

    @classmethod
    async def create_for_document(
        cls,
        corpus: Corpus,
        document: Document,
        user_id: Optional[int],
        config: AgentConfig,
        override_conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for document agent with enhanced options."""
        conversation = None

        # For anonymous users (user_id is None), do NOT create or store conversations
        if user_id is None:
            logger.debug(
                f"Creating ephemeral (non-stored) conversation for anonymous user on document {document.id}"
            )
            # Override config to ensure no message storage for anonymous conversations
            config.store_user_messages = False
            config.store_llm_messages = False
            # Return manager with no conversation - everything will be in-memory only
            return cls(None, None, config)

        # For authenticated users, handle conversation persistence normally
        if override_conversation:
            conversation = override_conversation
        elif config.conversation:
            conversation = config.conversation
        elif conversation_id or config.conversation_id:
            cid = conversation_id or config.conversation_id
            try:
                conversation = await Conversation.objects.aget(id=cid)
            except Conversation.DoesNotExist:
                logger.warning(f"Conversation {cid} not found, creating new one")

        if not conversation:
            # Create new conversation for authenticated user
            conversation = await Conversation.objects.acreate(
                title=f"Chat about {document.title}",
                description=f"Conversation about document: {document.title}",
                creator_id=user_id,
                chat_with_document=document,
            )
            logger.debug(
                f"Created new conversation {conversation.id} for document {document.id} (user: {user_id})"
            )

        manager = cls(conversation, user_id, config)

        # Load existing messages if provided
        if loaded_messages or config.loaded_messages:
            messages = loaded_messages or config.loaded_messages
            logger.debug(
                f"Loaded {len(messages)} existing messages for conversation {conversation.id}"
            )

        return manager

    @classmethod
    async def create_for_corpus(
        cls,
        corpus: Corpus,
        user_id: Optional[int],
        config: AgentConfig,
        override_conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[list[ChatMessage]] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for corpus agent with enhanced options."""
        conversation = None

        # For anonymous users (user_id is None), do NOT create or store conversations
        if user_id is None:
            logger.debug(
                f"Creating ephemeral (non-stored) conversation for anonymous user on corpus {corpus.id}"
            )
            # Override config to ensure no message storage for anonymous conversations
            config.store_user_messages = False
            config.store_llm_messages = False
            # Return manager with no conversation - everything will be in-memory only
            return cls(None, None, config)

        # For authenticated users, handle conversation persistence normally
        if override_conversation:
            conversation = override_conversation
        elif config.conversation:
            conversation = config.conversation
        elif conversation_id or config.conversation_id:
            cid = conversation_id or config.conversation_id
            try:
                conversation = await Conversation.objects.aget(id=cid)
            except Conversation.DoesNotExist:
                logger.warning(f"Conversation {cid} not found, creating new one")

        if not conversation:
            # Create new conversation for authenticated user
            conversation = await Conversation.objects.acreate(
                title=f"Chat about {corpus.title}",
                description=f"Conversation about corpus: {corpus.title}",
                creator_id=user_id,
                chat_with_corpus=corpus,
            )
            logger.debug(
                f"Created new conversation {conversation.id} for corpus {corpus.id} (user: {user_id})"
            )

        manager = cls(conversation, user_id, config)

        # Load existing messages if provided
        if loaded_messages or config.loaded_messages:
            messages = loaded_messages or config.loaded_messages
            logger.debug(
                f"Loaded {len(messages)} existing messages for conversation {conversation.id}"
            )

        return manager

    async def get_conversation_messages(self) -> list[ChatMessage]:
        """Get all messages in the conversation."""
        # For anonymous conversations, return empty list since nothing is stored
        if not self.conversation:
            return []

        return [
            msg
            async for msg in ChatMessage.objects.filter(
                conversation=self.conversation
            ).order_by("created")
        ]

    async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
        """Create a placeholder message with state tracking."""
        # For anonymous conversations, don't store messages
        if not self.conversation:
            return 0  # Return a placeholder ID for anonymous conversations

        message = await ChatMessage.objects.acreate(
            conversation=self.conversation,
            content="",
            msg_type=msg_type,
            creator_id=self.user_id,
            data={
                "state": MessageState.IN_PROGRESS,
                "created_at": timezone.now().isoformat(),
            },
        )
        return message.id

    async def update_message_content(self, message_id: int, content: str) -> None:
        """Update only the content of a message."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return

        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content
        await message.asave(update_fields=["content"])

    async def complete_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Complete a message with content, sources, and metadata in one operation."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return

        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content

        data = message.data or {}
        data["state"] = MessageState.COMPLETED
        data["completed_at"] = timezone.now().isoformat()

        if sources:
            data["sources"] = [source.to_dict() for source in sources]
        # Ensure a timeline key exists even if adapter didn't supply one
        if metadata:
            if "timeline" not in metadata:
                metadata["timeline"] = []
            data.update(metadata)
        else:
            data.setdefault("timeline", [])

        message.data = data
        await message.asave()

    async def cancel_message(self, message_id: int, reason: str = "Cancelled") -> None:
        """Cancel a placeholder message."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return

        message = await ChatMessage.objects.aget(id=message_id)
        message.content = reason
        data = message.data or {}
        data["state"] = MessageState.CANCELLED
        data["cancelled_at"] = timezone.now().isoformat()
        message.data = data
        await message.asave()

    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        # For anonymous conversations, don't store messages
        if not self.conversation:
            return 0  # Return a placeholder ID for anonymous conversations

        message = await ChatMessage.objects.acreate(
            conversation=self.conversation,
            content=content,
            msg_type="HUMAN",
            creator_id=self.user_id,
            data={
                "state": MessageState.COMPLETED,
                "created_at": timezone.now().isoformat(),
            },
        )
        return message.id

    async def store_llm_message(
        self,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> int:
        """Store an LLM message in the conversation."""
        # For anonymous conversations, don't store messages
        if not self.conversation:
            return 0  # Return a placeholder ID for anonymous conversations

        data = {
            "state": MessageState.COMPLETED,
            "created_at": timezone.now().isoformat(),
        }

        if sources:
            data["sources"] = [source.to_dict() for source in sources]
        if metadata:
            data.update(metadata)

        message = await ChatMessage.objects.acreate(
            conversation=self.conversation,
            content=content,
            msg_type="LLM",
            creator_id=self.user_id,
            data=data,
        )
        return message.id

    async def update_message(
        self,
        message_id: int,
        content: str,
        sources: list[SourceNode] = None,
        metadata: dict[str, Any] = None,
    ) -> None:
        """Update an existing message with content, sources, and metadata."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return

        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content

        data = message.data or {}
        data["updated_at"] = timezone.now().isoformat()

        if sources:
            data["sources"] = [source.to_dict() for source in sources]
        if metadata:
            data.update(metadata)

        message.data = data
        await message.asave()


def get_default_config(**overrides) -> AgentConfig:
    """Get default agent configuration with optional overrides."""
    defaults = {
        "model_name": "gpt-4o-mini",
        "api_key": getattr(settings, "OPENAI_API_KEY", None),
        "similarity_top_k": 10,
        "streaming": True,
        "verbose": True,
        "temperature": 0.7,
    }
    defaults.update(overrides)
    return AgentConfig(**defaults)
