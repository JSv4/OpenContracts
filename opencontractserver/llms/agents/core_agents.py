"""Core agent functionality independent of any specific agent framework."""

import logging
from typing import Any, Optional, Union, Protocol, runtime_checkable
from dataclasses import dataclass

from django.conf import settings

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.vector_stores.core_vector_stores import CoreAnnotationVectorStore

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    """Framework-agnostic agent configuration."""
    
    user_id: Optional[int] = None
    model_name: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    embedder_path: Optional[str] = None
    similarity_top_k: int = 10
    streaming: bool = True
    verbose: bool = True
    system_prompt: Optional[str] = None
    conversation: Optional[Conversation] = None
    loaded_messages: Optional[list[ChatMessage]] = None


@dataclass 
class DocumentAgentContext:
    """Context for document-specific agents."""
    
    document: Document
    config: AgentConfig
    vector_store: Optional[CoreAnnotationVectorStore] = None
    
    def __post_init__(self):
        """Initialize vector store if not provided."""
        if self.vector_store is None:
            self.vector_store = CoreAnnotationVectorStore(
                user_id=self.config.user_id,
                document_id=self.document.id,
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
    """Protocol defining the interface for framework-agnostic agents."""
    
    async def chat(self, message: str) -> str:
        """Send a message and get a complete response."""
        ...
    
    async def stream_chat(self, message: str) -> Any:
        """Send a message and get a streaming response."""
        ...
    
    async def store_message(self, content: str, msg_type: str = "LLM") -> int:
        """Store a message in the conversation history."""
        ...


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
    def get_tool_descriptions(document: Document) -> list[dict[str, str]]:
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
        config: AgentConfig,
    ) -> DocumentAgentContext:
        """Create document agent context with all necessary components."""
        if not isinstance(document, Document):
            document = await Document.objects.aget(id=document)
        
        # Set default system prompt if not provided
        if config.system_prompt is None:
            config.system_prompt = CoreDocumentAgentFactory.get_default_system_prompt(document)
        
        return DocumentAgentContext(document=document, config=config)


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
        corpus_id: Union[str, int],
        config: AgentConfig,
    ) -> CorpusAgentContext:
        """Create corpus agent context with all necessary components."""
        corpus = await Corpus.objects.aget(id=corpus_id)
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
    """Manages conversations and message storage independent of agent framework."""
    
    def __init__(self, conversation: Optional[Conversation], user_id: Optional[int]):
        self.conversation = conversation
        self.user_id = user_id
    
    @classmethod
    async def create_for_document(
        cls,
        document: Document,
        user_id: Optional[int],
        override_conversation: Optional[Conversation] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for document agent."""
        if override_conversation:
            conversation = override_conversation
        else:
            # Create new conversation for this document
            conversation = await Conversation.objects.acreate(
                title=f"Chat about {document.title}",
                description=f"Conversation about document: {document.title}",
                user_id=user_id,
            )
        
        return cls(conversation, user_id)
    
    @classmethod
    async def create_for_corpus(
        cls,
        corpus: Corpus,
        user_id: Optional[int],
        override_conversation: Optional[Conversation] = None,
    ) -> "CoreConversationManager":
        """Create conversation manager for corpus agent."""
        if override_conversation:
            conversation = override_conversation
        else:
            # Create new conversation for this corpus
            conversation = await Conversation.objects.acreate(
                title=f"Chat about {corpus.title}",
                description=f"Conversation about corpus: {corpus.title}",
                user_id=user_id,
            )
        
        return cls(conversation, user_id)
    
    async def store_user_message(self, content: str) -> int:
        """Store a user message in the conversation."""
        message = await ChatMessage.objects.acreate(
            conversation=self.conversation,
            content=content,
            msg_type="USER",
            user_id=self.user_id,
        )
        return message.id
    
    async def store_llm_message(self, content: str, data: Optional[dict] = None) -> int:
        """Store an LLM message in the conversation."""
        message = await ChatMessage.objects.acreate(
            conversation=self.conversation,
            content=content,
            msg_type="LLM",
            user_id=self.user_id,
            data=data or {},
        )
        return message.id
    
    async def update_message(self, message_id: int, content: str, data: Optional[dict] = None) -> None:
        """Update an existing message."""
        message = await ChatMessage.objects.aget(id=message_id)
        message.content = content
        if data:
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
    }
    defaults.update(overrides)
    return AgentConfig(**defaults) 