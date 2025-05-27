"""Core agent functionality independent of any specific agent framework."""

import logging
from typing import Any, Optional, Union, Protocol, runtime_checkable, AsyncGenerator, List, Dict
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from django.utils import timezone

from django.conf import settings

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.vector_stores.core_vector_stores import CoreAnnotationVectorStore
from opencontractserver.utils.embeddings import get_embedder

logger = logging.getLogger(__name__)


class MessageState:
    """Constants for message states."""
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


@dataclass
class SourceNode:
    """Framework-agnostic representation of a source node with metadata."""
    
    annotation_id: int
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
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
                "annotation_label": annotation.annotation_label.text if annotation.annotation_label else None,
            },
            similarity_score=similarity_score
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage in message data."""
        return {
            "annotation_id": self.annotation_id,
            "content": self.content,
            "metadata": self.metadata,
            "similarity_score": self.similarity_score,
        }


@dataclass
class UnifiedChatResponse:
    """Framework-agnostic chat response with sources and metadata."""
    
    content: str
    sources: List[SourceNode] = field(default_factory=list)
    user_message_id: Optional[int] = None
    llm_message_id: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class UnifiedStreamResponse:
    """Framework-agnostic streaming response chunk."""
    
    content: str
    accumulated_content: str = ""
    sources: List[SourceNode] = field(default_factory=list)
    user_message_id: Optional[int] = None
    llm_message_id: Optional[int] = None
    is_complete: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


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
    
    # Enhanced conversation management
    conversation: Optional[Conversation] = None
    conversation_id: Optional[int] = None
    loaded_messages: Optional[List[ChatMessage]] = None
    store_user_messages: bool = True
    store_llm_messages: bool = True
    
    # Tool configuration
    tools: List[Any] = field(default_factory=list)


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
    documents: Optional[List[Document]] = None
    
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
    
    async def stream(self, message: str, **kwargs) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Send a message and get a streaming response with sources."""
        ...
    
    # Message management methods
    async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
        """Create a placeholder message and return its ID."""
        ...
    
    async def update_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
        """Update a stored message with content, sources, and metadata."""
        ...
    
    async def complete_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
        """Complete a message atomically with content, sources, and metadata."""
        ...
    
    async def cancel_message(self, message_id: int, reason: str = "Cancelled") -> None:
        """Cancel a placeholder message."""
        ...
    
    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        ...
    
    async def store_llm_message(self, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> int:
        """Store an LLM message in the conversation."""
        ...
    
    # Conversation metadata methods
    def get_conversation_id(self) -> Optional[int]:
        """Get the current conversation ID for session continuity."""
        ...
    
    def get_conversation_info(self) -> Dict[str, Any]:
        """Get conversation metadata including ID, title, and user info."""
        ...
    
    async def get_conversation_messages(self) -> List[ChatMessage]:
        """Get all messages in the current conversation."""
        ...
    
    # Legacy compatibility methods
    async def stream_chat(self, message: str, **kwargs) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Legacy method - delegates to stream()."""
        async for chunk in self.stream(message, **kwargs):
            yield chunk
    
    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Legacy method - delegates to appropriate store method."""
        if msg_type.upper() == "USER":
            return await self.store_user_message(content)
        else:
            return await self.store_llm_message(content)


class CoreAgentBase(ABC):
    """Base implementation of CoreAgent with common functionality."""
    
    def __init__(self, config: AgentConfig, conversation_manager: "CoreConversationManager"):
        self.config = config
        self.conversation_manager = conversation_manager
    
    async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
        """Create a placeholder message and return its ID."""
        return await self.conversation_manager.create_placeholder_message(msg_type)
    
    async def update_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
        """Update a stored message with content, sources, and metadata."""
        await self.conversation_manager.update_message(message_id, content, sources, metadata)
    
    async def complete_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
        """Complete a message atomically with content, sources, and metadata."""
        await self.conversation_manager.complete_message(message_id, content, sources, metadata)
    
    async def cancel_message(self, message_id: int, reason: str = "Cancelled") -> None:
        """Cancel a placeholder message."""
        await self.conversation_manager.cancel_message(message_id, reason)
    
    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        return await self.conversation_manager.store_user_message(content)
    
    async def store_llm_message(self, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> int:
        """Store an LLM message in the conversation."""
        return await self.conversation_manager.store_llm_message(content, sources, metadata)
    
    def get_conversation_id(self) -> Optional[int]:
        """Get the current conversation ID for session continuity."""
        return self.conversation_manager.conversation.id if self.conversation_manager.conversation else None
    
    def get_conversation_info(self) -> Dict[str, Any]:
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
    
    async def get_conversation_messages(self) -> List[ChatMessage]:
        """Get all messages in the current conversation."""
        return await self.conversation_manager.get_conversation_messages()
    
    # Legacy compatibility methods
    async def stream_chat(self, message: str, **kwargs) -> AsyncGenerator[UnifiedStreamResponse, None]:
        """Legacy method - delegates to stream()."""
        async for chunk in self.stream(message, **kwargs):
            yield chunk
    
    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Legacy method - delegates to appropriate store method."""
        if msg_type.upper() == "USER":
            return await self.store_user_message(content)
        else:
            return await self.store_llm_message(content)


class CoreDocumentAgentFactory:
    """Factory for creating document agents with framework-agnostic configuration."""
    
    @staticmethod
    def get_default_system_prompt(document: Document) -> str:
        """Generate default system prompt for document agent."""
        return (
            f"You thoroughly answer requests about the document titled '{document.title}' "
            f"(ID: {document.id}). This document is described as:\n\n`{document.description}`\n\n"
            "Return your answers in thoughtful, attractive markdown. "
            "Avoid repeating instructions, writing down your thought processes (unless asked), or giving disclaimers."
        )
    
    @staticmethod
    def get_tool_descriptions(document: Document) -> List[Dict[str, str]]:
        """Get standardized tool descriptions for document agents."""
        return [
            {
                "name": "doc_engine",
                "description": f"Provides detailed annotations and text from within the '{document.title}' document.",
            },
            {
                "name": "load_document_md_summary_tool",
                "description": "Load markdown summary of the document.",
            },
            {
                "name": "get_md_summary_token_length_tool", 
                "description": "Get token length of markdown summary.",
            },
            {
                "name": "get_notes_for_document_corpus_tool",
                "description": "Get notes for document or corpus.",
            },
            {
                "name": "get_note_content_token_length_tool",
                "description": "Get token length of note content.",
            },
            {
                "name": "get_partial_note_content_tool",
                "description": "Get partial note content.",
            },
        ]
    
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
        # Ensure an embedder is configured.
        # ------------------------------------------------------------------
        if config.embedder_path is None:
            _, name = get_embedder(corpus.id)
            config.embedder_path = name
           
        # Set default system prompt if not provided
        if config.system_prompt is None:
            config.system_prompt = CoreDocumentAgentFactory.get_default_system_prompt(document)
        
        return DocumentAgentContext(corpus=corpus, document=document, config=config)


class CoreCorpusAgentFactory:
    """Factory for creating corpus agents with framework-agnostic configuration."""
    
    @staticmethod
    def get_default_system_prompt(corpus: Corpus) -> str:
        """Generate default system prompt for corpus agent."""
        return (
            f"You are an agent designed to answer queries about documents in a collection of documents "
            f"called a corpus. This corpus is called '{corpus.title}'. "
            "Please always use the provided tools (each corresponding to a document) to answer questions. "
            "Do not rely on prior knowledge."
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
            config.system_prompt = CoreCorpusAgentFactory.get_default_system_prompt(corpus)
        
        # Use corpus preferred embedder if not specified
        if config.embedder_path is None:
            config.embedder_path = corpus.preferred_embedder
        
        context = CorpusAgentContext(corpus=corpus, config=config, documents=documents)
        await context.__post_init__()
        return context


class CoreConversationManager:
    """Enhanced conversation manager with full message lifecycle support and atomic operations."""
    
    def __init__(self, conversation: Optional[Conversation], user_id: Optional[int], config: AgentConfig):
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
        loaded_messages: Optional[List[ChatMessage]] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for document agent with enhanced options."""
        conversation = None
        
        # For anonymous users (user_id is None), do NOT create or store conversations
        if user_id is None:
            logger.info(f"Creating ephemeral (non-stored) conversation for anonymous user on document {document.id}")
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
            logger.info(f"Created new conversation {conversation.id} for document {document.id} (user: {user_id})")
        
        manager = cls(conversation, user_id, config)
        
        # Load existing messages if provided
        if loaded_messages or config.loaded_messages:
            messages = loaded_messages or config.loaded_messages
            logger.info(f"Loaded {len(messages)} existing messages for conversation {conversation.id}")
        
        return manager
    
    @classmethod
    async def create_for_corpus(
        cls,
        corpus: Corpus,
        user_id: Optional[int],
        config: AgentConfig,
        override_conversation: Optional[Conversation] = None,
        conversation_id: Optional[int] = None,
        loaded_messages: Optional[List[ChatMessage]] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for corpus agent with enhanced options."""
        conversation = None
        
        # For anonymous users (user_id is None), do NOT create or store conversations
        if user_id is None:
            logger.info(f"Creating ephemeral (non-stored) conversation for anonymous user on corpus {corpus.id}")
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
            )
            logger.info(f"Created new conversation {conversation.id} for corpus {corpus.id} (user: {user_id})")
        
        manager = cls(conversation, user_id, config)
        
        # Load existing messages if provided
        if loaded_messages or config.loaded_messages:
            messages = loaded_messages or config.loaded_messages
            logger.info(f"Loaded {len(messages)} existing messages for conversation {conversation.id}")
        
        return manager
    
    async def get_conversation_messages(self) -> List[ChatMessage]:
        """Get all messages in the conversation."""
        # For anonymous conversations, return empty list since nothing is stored
        if not self.conversation:
            return []
        
        return [
            msg async for msg in ChatMessage.objects.filter(
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
                "created_at": timezone.now().isoformat()
            }
        )
        return message.id
    
    async def update_message_content(self, message_id: int, content: str) -> None:
        """Update only the content of a message."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return
        
        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content
        await message.asave(update_fields=['content'])
    
    async def update_message_sources(self, message_id: int, sources: List[SourceNode]) -> None:
        """Update only the sources of a message."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return
        
        message = await ChatMessage.objects.aget(id=message_id)
        if not message.data:
            message.data = {}
        message.data["sources"] = [source.to_dict() for source in sources]
        await message.asave(update_fields=['data'])
    
    async def set_message_state(self, message_id: int, state: str) -> None:
        """Update the state of a message."""
        # For anonymous conversations, don't store messages
        if not self.conversation or message_id == 0:
            return
        
        message = await ChatMessage.objects.aget(id=message_id)
        if not message.data:
            message.data = {}
        message.data["state"] = state
        message.data["updated_at"] = timezone.now().isoformat()
        await message.asave(update_fields=['data'])
    
    async def complete_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
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
        if metadata:
            data.update(metadata)
        
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
                "created_at": timezone.now().isoformat()
            }
        )
        return message.id
    
    async def store_llm_message(self, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> int:
        """Store an LLM message in the conversation."""
        # For anonymous conversations, don't store messages
        if not self.conversation:
            return 0  # Return a placeholder ID for anonymous conversations
        
        data = {
            "state": MessageState.COMPLETED,
            "created_at": timezone.now().isoformat()
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
    
    async def update_message(self, message_id: int, content: str, sources: List[SourceNode] = None, metadata: Dict[str, Any] = None) -> None:
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