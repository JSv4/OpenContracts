"""
Elegant top-level API for OpenContracts LLM framework.

This module provides the beautiful, simple interface that makes creating
document and corpus agents a joy to use. It acts as a thin wrapper around
the underlying factories.
"""

import logging
from typing import Any, Optional, Union, List, Dict, Literal

from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.documents.models import Document
from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.core_agents import CoreAgent
from opencontractserver.llms.agents.agent_factory import UnifiedAgentFactory
from opencontractserver.llms.tools.tool_factory import CoreTool, create_document_tools
from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory
from opencontractserver.utils.embeddings import generate_embeddings_from_text

logger = logging.getLogger(__name__)

# Type aliases for cleaner API
FrameworkType = Union[AgentFramework, Literal["llama_index", "pydantic_ai"]]
DocumentType = Union[str, int, Document]
ToolType = Union[str, CoreTool, callable]


class AgentAPI:
    """Beautiful, simple API for creating document and corpus agents."""
    
    @staticmethod
    async def for_document(
        document: DocumentType,
        *,
        framework: FrameworkType = "llama_index",
        user_id: Optional[int] = None,
        model: str = "gpt-4o-mini",
        system_prompt: Optional[str] = None,
        conversation: Optional[Conversation] = None,
        messages: Optional[List[ChatMessage]] = None,
        tools: Optional[List[ToolType]] = None,
        embedder: Optional[str] = None,
        streaming: bool = True,
        verbose: bool = False,
        **kwargs
    ) -> CoreAgent:
        """
        Create a document agent with minimal configuration.
        
        Args:
            document: Document ID, instance, or path
            framework: "llama_index" or "pydantic_ai" 
            user_id: User ID for message attribution
            model: LLM model name (e.g., "gpt-4", "claude-3-sonnet")
            system_prompt: Custom system prompt (auto-generated if None)
            conversation: Existing conversation to continue
            messages: Pre-loaded chat messages
            tools: List of tool names, CoreTool instances, or functions
            embedder: Custom embedder path
            streaming: Enable streaming responses
            verbose: Enable verbose logging
            **kwargs: Additional framework-specific options
            
        Returns:
            CoreAgent: Ready-to-use agent implementing the CoreAgent protocol
            
        Examples:
            # Minimal usage
            agent = await agents.for_document(123)
            response = await agent.chat("What is this about?")
            
            # With custom configuration
            agent = await agents.for_document(
                document=my_doc,
                framework="pydantic_ai",
                model="gpt-4",
                system_prompt="You are a legal expert...",
                tools=["summarize", "extract_entities"],
                user_id=456
            )
        """
        # Normalize framework
        if isinstance(framework, str):
            framework = AgentFramework(framework)
        
        # Convert tool names to CoreTool instances
        resolved_tools = _resolve_tools(tools) if tools else None
        
        return await UnifiedAgentFactory.create_document_agent(
            document=document,
            framework=framework,
            user_id=user_id,
            override_conversation=conversation,
            override_system_prompt=system_prompt,
            loaded_messages=messages,
            embedder_path=embedder,
            tools=resolved_tools,
            model_name=model,
            streaming=streaming,
            verbose=verbose,
            **kwargs
        )
    
    @staticmethod
    async def for_corpus(
        corpus_id: Union[str, int],
        *,
        framework: FrameworkType = "llama_index",
        user_id: Optional[int] = None,
        model: str = "gpt-4o-mini",
        system_prompt: Optional[str] = None,
        conversation: Optional[Conversation] = None,
        messages: Optional[List[ChatMessage]] = None,
        tools: Optional[List[ToolType]] = None,
        embedder: Optional[str] = None,
        streaming: bool = True,
        verbose: bool = False,
        **kwargs
    ) -> CoreAgent:
        """
        Create a corpus agent with minimal configuration.
        
        Args:
            corpus_id: Corpus ID
            framework: "llama_index" or "pydantic_ai"
            user_id: User ID for message attribution
            model: LLM model name (e.g., "gpt-4", "claude-3-sonnet")
            system_prompt: Custom system prompt (auto-generated if None)
            conversation: Existing conversation to continue
            messages: Pre-loaded chat messages
            tools: List of tool names, CoreTool instances, or functions
            embedder: Custom embedder path (uses corpus default if None)
            streaming: Enable streaming responses
            verbose: Enable verbose logging
            **kwargs: Additional framework-specific options
            
        Returns:
            CoreAgent: Ready-to-use agent implementing the CoreAgent protocol
            
        Examples:
            # Minimal usage
            agent = await agents.for_corpus(456)
            response = await agent.chat("What are the key themes?")
            
            # With streaming
            agent = await agents.for_corpus(456, framework="pydantic_ai")
            async for chunk in agent.stream("Summarize findings"):
                print(chunk, end="")
        """
        # Normalize framework
        if isinstance(framework, str):
            framework = AgentFramework(framework)
        
        # Convert tool names to CoreTool instances
        resolved_tools = _resolve_tools(tools) if tools else None
        
        return await UnifiedAgentFactory.create_corpus_agent(
            corpus_id=corpus_id,
            framework=framework,
            user_id=user_id,
            override_conversation=conversation,
            override_system_prompt=system_prompt,
            loaded_messages=messages,
            tools=resolved_tools,
            model_name=model,
            streaming=streaming,
            verbose=verbose,
            **kwargs
        )


class EmbeddingAPI:
    """Simple API for generating embeddings."""
    
    @staticmethod
    def generate(
        text: str,
        *,
        corpus_id: Optional[int] = None,
        mimetype: Optional[str] = None,
        embedder: Optional[str] = None
    ) -> tuple[Optional[str], Optional[List[float]]]:
        """
        Generate embeddings for text using the OpenContracts pipeline.
        
        Args:
            text: Text to embed
            corpus_id: Optional corpus ID for context-specific embedding
            mimetype: Optional mimetype for context
            embedder: Optional custom embedder path
            
        Returns:
            Tuple of (embedder_path, embedding_vector)
            
        Examples:
            # Simple embedding
            embedder_path, vector = embeddings.generate("Hello world")
            
            # With corpus context
            embedder_path, vector = embeddings.generate(
                "Legal document text",
                corpus_id=123,
                mimetype="application/pdf"
            )
        """
        return generate_embeddings_from_text(
            text=text,
            corpus_id=corpus_id,
            mimetype=mimetype,
            embedder_path=embedder
        )


class ToolAPI:
    """Simple API for working with tools."""
    
    @staticmethod
    def document_tools() -> List[CoreTool]:
        """Get standard document-related tools."""
        return create_document_tools()
    
    @staticmethod
    def from_function(
        func: callable,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameter_descriptions: Optional[Dict[str, str]] = None
    ) -> CoreTool:
        """
        Create a CoreTool from a Python function.
        
        Args:
            func: Python function to wrap
            name: Optional custom name
            description: Optional custom description
            parameter_descriptions: Optional parameter descriptions
            
        Returns:
            CoreTool instance
            
        Examples:
            def my_tool(query: str) -> str:
                '''Search for information.'''
                return f"Results for: {query}"
            
            tool = tools.from_function(my_tool)
        """
        return CoreTool.from_function(
            func=func,
            name=name,
            description=description,
            parameter_descriptions=parameter_descriptions
        )


class VectorStoreAPI:
    """Simple API for working with vector stores."""
    
    @staticmethod
    def create(
        framework: FrameworkType = "llama_index",
        *,
        user_id: Optional[Union[str, int]] = None,
        corpus_id: Optional[Union[str, int]] = None,
        document_id: Optional[Union[str, int]] = None,
        embedder_path: Optional[str] = None,
        must_have_text: Optional[str] = None,
        embed_dim: int = 384,
        **kwargs
    ) -> Any:
        """
        Create a vector store using the specified framework.
        
        Args:
            framework: "llama_index" or "pydantic_ai"
            user_id: Filter by user ID
            corpus_id: Filter by corpus ID
            document_id: Filter by document ID
            embedder_path: Path to embedder model to use
            must_have_text: Filter by text content
            embed_dim: Embedding dimension to use (384, 768, 1536, or 3072)
            **kwargs: Additional framework-specific arguments
            
        Returns:
            Framework-specific vector store instance
            
        Examples:
            # LlamaIndex vector store
            store = vector_stores.create("llama_index", corpus_id=123)
            
            # Pydantic AI vector store
            store = vector_stores.create("pydantic_ai", document_id=456)
        """
        # Normalize framework
        if isinstance(framework, str):
            framework = AgentFramework(framework)
        
        return UnifiedVectorStoreFactory.create_vector_store(
            framework=framework,
            user_id=user_id,
            corpus_id=corpus_id,
            document_id=document_id,
            embedder_path=embedder_path,
            must_have_text=must_have_text,
            embed_dim=embed_dim,
            **kwargs
        )


def _resolve_tools(tools: List[ToolType]) -> List[CoreTool]:
    """Convert tool specifications to CoreTool instances."""
    resolved = []
    
    # Built-in tool registry
    builtin_tools = {
        "load_md_summary": "load_document_md_summary",
        "md_summary_length": "get_md_summary_token_length", 
        "get_notes": "get_notes_for_document_corpus",
        "note_length": "get_note_content_token_length",
        "partial_note": "get_partial_note_content",
        "summarize": "load_document_md_summary",  # Alias
        "notes": "get_notes_for_document_corpus",  # Alias
    }
    
    for tool in tools:
        if isinstance(tool, str):
            # Look up built-in tool by name
            if tool in builtin_tools:
                # Import the actual function
                from opencontractserver.llms.tools.core_tools import (
                    load_document_md_summary,
                    get_md_summary_token_length,
                    get_notes_for_document_corpus,
                    get_note_content_token_length,
                    get_partial_note_content,
                )
                
                func_map = {
                    "load_document_md_summary": load_document_md_summary,
                    "get_md_summary_token_length": get_md_summary_token_length,
                    "get_notes_for_document_corpus": get_notes_for_document_corpus,
                    "get_note_content_token_length": get_note_content_token_length,
                    "get_partial_note_content": get_partial_note_content,
                }
                
                func_name = builtin_tools[tool]
                if func_name in func_map:
                    resolved.append(CoreTool.from_function(func_map[func_name]))
                else:
                    logger.warning(f"Unknown built-in tool function: {func_name}")
            else:
                logger.warning(f"Unknown built-in tool: {tool}")
        elif isinstance(tool, CoreTool):
            resolved.append(tool)
        elif callable(tool):
            resolved.append(CoreTool.from_function(tool))
        else:
            logger.warning(f"Invalid tool specification: {tool}")
    
    return resolved


# Create singleton instances for the beautiful API
agents = AgentAPI()
embeddings = EmbeddingAPI()
tools = ToolAPI()
vector_stores = VectorStoreAPI() 