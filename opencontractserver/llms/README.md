# OpenContracts LLM Framework

OpenContract's API for creating document and corpus agents.

## Philosophy

- **Simplicity**: Beautiful, intuitive APIs that make complex operations feel natural
- **Framework Agnostic**: Support multiple LLM frameworks (LlamaIndex, PydanticAI) through unified interfaces
- **Rich Responses**: Every interaction returns structured data with sources, metadata, and conversation tracking
- **Conversation Management**: Persistent conversations with automatic message storage and retrieval
- **Tool Integration**: Extensible tool system for document analysis and data retrieval
- **Type Safety**: Full type hints and structured responses throughout

## Quick Start

```python
from opencontractserver.llms import agents
# Assuming you have a document_id and corpus_id or objects
# from opencontractserver.corpuses.models import Corpus
# from opencontractserver.documents.models import Document
# document_obj = Document.objects.get(id=123)
# corpus_obj = Corpus.objects.get(id=1)

# Create a document agent
# Note: The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(document=123, corpus=1) # Replace 1 with your actual corpus_id or object

# Chat with rich responses
response = await agent.chat("What are the key terms in this contract?")
print(f"Response: {response.content}")
print(f"Sources: {len(response.sources)} found")
print(f"Message ID: {response.llm_message_id}")

# Stream responses
async for chunk in agent.stream("Summarize the main obligations"):
    print(chunk.content, end="")
```

## Core Concepts

### High-Level APIs

The `opencontractserver.llms` module provides several high-level API entry points:

- **`agents`**: (`AgentAPI`) For creating and interacting with document and corpus agents. This is the most common entry point.
- **`embeddings`**: (`EmbeddingAPI`) For generating text embeddings.
- **`vector_stores`**: (`VectorStoreAPI`) For creating and interacting with vector stores for similarity search.
- **`tools`**: (`ToolAPI`) For creating and managing `CoreTool` instances.

```python
from opencontractserver.llms import agents, embeddings, vector_stores, tools
from opencontractserver.llms.tools.tool_factory import CoreTool

# Example: Creating a tool using the ToolAPI
def my_custom_function(text: str) -> str:
    """A simple custom tool."""
    return f"Processed: {text}"

custom_tool = tools.create_from_function(
    func=my_custom_function,
    name="MyCustomTool",
    description="A demonstration tool."
)
# This custom_tool can then be passed to an agent.
```

### Agents

Agents are the primary interface for interacting with documents and corpora. They provide:

- **Document Agents**: Work with individual documents (always within the context of a corpus).
- **Corpus Agents**: Work with collections of documents.
- **Framework Flexibility**: Choose between LlamaIndex, PydanticAI, or future frameworks.
- **Conversation Persistence**: Automatic conversation management and message storage.

#### Creating Agents

```python
from opencontractserver.llms import agents
from opencontractserver.llms.types import AgentFramework
# from opencontractserver.corpuses.models import Corpus # For corpus_obj
# from opencontractserver.documents.models import Document # For document_obj
# corpus_obj = Corpus.objects.get(id=1) # Example corpus
# document_obj = Document.objects.get(id=123) # Example document

# Document agent with default framework (LlamaIndex)
# The '''corpus''' parameter is required.
agent = await agents.for_document(document=123, corpus=1) # Use actual document/corpus IDs or objects

# Corpus agent with specific framework
agent = await agents.for_corpus(
    corpus=456, # Use actual corpus ID or object
    framework=AgentFramework.PYDANTIC_AI
)

# With custom configuration
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    user_id=789,
    system_prompt="You are a legal contract analyzer...",
    model="gpt-4",
    temperature=0.1,
    tools=["load_md_summary", "get_notes_for_document_corpus"]
)

# Advanced: Using existing conversation or preloaded messages
# from opencontractserver.conversations.models import Conversation, ChatMessage
# existing_conversation = Conversation.objects.aget(id=your_conversation_id)
# preloaded_messages = await ChatMessage.objects.filter(conversation_id=your_conversation_id).order_by('''created_at''')
# agent = await agents.for_document(
#     document=123,
#     corpus=1,
#     user_id=789,
#     conversation=existing_conversation, # Optionally pass an existing Conversation object
#     # loaded_messages=list(preloaded_messages), # Optionally pass preloaded messages
#     # override_conversation=True # Set to True to use only loaded_messages and ignore others from conversation object
# )

```

#### Agent Responses

All agent interactions return rich, structured responses with complete metadata:

```python
# UnifiedChatResponse structure
response = await agent.chat("What are the payment terms?")

response.content              # The LLM's response text
response.sources              # List of SourceNode objects with citations
response.user_message_id      # ID of stored user message (if persistence enabled)
response.llm_message_id       # ID of stored LLM response (if persistence enabled)  
response.metadata             # Additional response metadata (framework-specific)

# UnifiedStreamResponse structure (for streaming)
async for chunk in agent.stream("Analyze the liability clauses"):
    chunk.content             # Incremental content for this chunk
    chunk.accumulated_content # Complete content so far
    chunk.sources             # Sources (populated in final chunk)
    chunk.user_message_id     # User message ID (available after first chunk)
    chunk.llm_message_id      # LLM message ID (available after first chunk)
    chunk.is_complete         # True for the final chunk
    chunk.metadata            # Chunk metadata

# SourceNode structure (individual source)
for source in response.sources:
    source.annotation_id      # Database ID of the source annotation
    source.content           # Raw text content of the annotation
    source.similarity_score  # Relevance score (0.0 to 1.0)
    source.metadata         # Dict with document_id, corpus_id, page, annotation_label, etc.
    
    # Convenience method for serialization
    source_dict = source.to_dict()  # Returns flattened dict for storage/transmission

# Note: conversation_id is available via agent.get_conversation_id()
```

#### Source Structure

All sources returned by agents follow a standardized format that includes annotation metadata and similarity scores:

```python
# Example source object structure
source = {
    "annotation_id": 123,
    "rawText": "This is the annotation content",
    "similarity_score": 0.85,
    "document_id": 456,
    "corpus_id": 789,
    "page": 2,
    "annotation_label": "Contract Clause"
}

# Sources are consistent across all contexts:
response = await agent.chat("What are the payment terms?")
for source in response.sources:
    print(f"Source: {source.annotation_id} (score: {source.similarity_score})")
    print(f"Content: {source.content}")
    print(f"Metadata: {source.metadata}")
```

This format is used consistently in:
- Database storage (ChatMessage.data['sources'])
- WebSocket streaming (ASYNC_FINISH messages)
- API responses (UnifiedChatResponse.sources)
- Vector store search results

### Conversation Management

The framework provides sophisticated conversation management through the `CoreConversationManager`:

#### Persistent Conversations

```python
# Create agent with persistent conversation
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    user_id=456,  # Required for persistence
    conversation_id=789  # Optional: resume existing conversation
)

# Messages are automatically stored
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained

# Access conversation info
conversation_id = agent.get_conversation_id()
conversation_info = agent.get_conversation_info()
print(f"Conversation has {conversation_info['message_count']} messages")
```

#### Anonymous Conversations

```python
# Anonymous sessions - context maintained in memory only
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(document=123, corpus=1)  # No user_id, use actual document/corpus IDs
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained in memory

# Anonymous conversations are session-only and not persisted
conversation_id = agent.get_conversation_id()  # Returns None for anonymous
conversation_info = agent.get_conversation_info()  # Returns basic info with no persistence

# Important: Anonymous conversations cannot be restored later
```

#### Message Storage Control

```python
# Control message storage per interaction
response = await agent.chat(
    "Sensitive query that shouldn'''t be stored",
    store_messages=False  # Skip database storage
)

# Manual message storage
user_msg_id = await agent.store_user_message("Custom user message")
llm_msg_id = await agent.store_llm_message("Custom LLM response")
```

### Tools

The framework provides a unified tool system that works across all supported frameworks. Core tools often have synchronous and asynchronous versions (e.g., `load_document_md_summary` and `aload_document_md_summary`).

#### Built-in Tools

```python
from opencontractserver.llms.tools import create_document_tools # Convenience function
from opencontractserver.llms.tools.core_tools import (
    load_document_md_summary, # Sync version
    aload_document_md_summary, # Async version
    get_notes_for_document_corpus,
    aget_notes_for_document_corpus, # Async version
    get_md_summary_token_length
)

# Use built-in tools by name (async versions preferred when available)
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    tools=["load_md_summary", "get_notes_for_document_corpus", "get_md_summary_token_length"]
)

# Or use CoreTool objects directly (e.g., from the convenience function)
# create_document_tools() provides a list of pre-configured CoreTool instances.
document_tools = create_document_tools()
agent = await agents.for_document(document=123, corpus=1, tools=document_tools) # Use actual document/corpus IDs
```

#### Custom Tools

```python
from opencontractserver.llms.tools.tool_factory import CoreTool # Can also use opencontractserver.llms.tools.create_from_function

def analyze_contract_risk(contract_text: str) -> str:
    """Analyze contract risk factors."""
    # Your custom analysis logic
    return "Risk analysis results..."

# Create CoreTool from function
risk_tool = CoreTool.from_function(
    analyze_contract_risk,
    description="Analyze contract risk factors"
)

# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    tools=[risk_tool]
)
```

#### Framework-Specific Tools

The framework automatically converts tools to the appropriate format:

```python
# LlamaIndex: CoreTool → FunctionTool
# PydanticAI: CoreTool → PydanticAIToolWrapper

# Tools work seamlessly across frameworks
# The '''corpus''' parameter is required for document agents.
llama_agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    framework=AgentFramework.LLAMA_INDEX,
    tools=["load_md_summary"]
)

pydantic_agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    framework=AgentFramework.PYDANTIC_AI,
    tools=["load_md_summary"]  # Same tool, different framework
)
```

### Streaming

All agents support streaming responses for real-time interaction:

```python
# Stream with automatic message storage
async for chunk in agent.stream("Summarize findings from all documents"):
    print(chunk.content, end="")
    
    # Access metadata during streaming
    if chunk.is_complete:
        print(f"
Sources: {len(chunk.sources)}")
        print(f"Message ID: {chunk.llm_message_id}")

# Stream without storage
async for chunk in agent.stream("Temporary query", store_messages=False):
    print(chunk.content, end="")
```

### Embeddings

The framework provides both sync and async embeddings APIs via `opencontractserver.llms.embeddings`:

```python
from opencontractserver.llms import embeddings

# Async version (recommended)
embedder_path, vector = await embeddings.agenerate("Contract analysis text")
print(f"Using embedder: {embedder_path}")
print(f"Vector dimension: {len(vector)}")
print(f"Vector type: {type(vector)}")  # numpy.ndarray

# Sync version (for compatibility)
embedder_path, vector = embeddings.generate("Contract analysis text")

# The embeddings integrate with the vector stores for document search
```

### Vector Stores

Vector stores provide both sync and async search methods, accessible via `opencontractserver.llms.vector_stores`.

```python
from opencontractserver.llms import vector_stores
from opencontractserver.llms.vector_stores.core_vector_stores import VectorSearchQuery

# Create vector store (framework-specific store will be chosen based on config or default)
store = vector_stores.create(
    framework="llama_index", # Or "pydantic_ai", or omit for default
    user_id=123, # Optional, for user-specific data if applicable
    corpus_id=456 # Or document_id for document-specific vector store context
)

# Search annotations
query = VectorSearchQuery(
    query_text="payment obligations",
    similarity_top_k=10
)

# Async search (recommended)
results = await store.async_search(query)

# Sync search (for compatibility)
results = store.search(query)

for result in results:
    print(f"Score: {result.similarity_score}")
    print(f"Text: {result.annotation.raw_text[:100]}...")
```

## Architecture

The framework follows a layered architecture that separates concerns and enables framework flexibility:

```
┌─────────────────────────────────────────┐
│           API Layer                     │  ← api.py (agents, embeddings, vector_stores, tools)
├─────────────────────────────────────────┤
│        Framework Adapter Layer          │  ← agents/llama_index_agents.py
│ (Implements CoreAgent for specific SDK) │     agents/pydantic_ai_agents.py
├─────────────────────────────────────────┤
│         Core Agent Protocol             │  ← agents/core_agents.py (Defines .chat, .stream)
│         & Unified Tool System           │  ← tools/ (CoreTool, UnifiedToolFactory)
├─────────────────────────────────────────┤
│         Core Business Logic             │  ← Framework-agnostic utils, config
│         & Conversation Management       │     conversations/ (CoreConversationManager)
├─────────────────────────────────────────┤
│      Django Models & Vector Stores      │  ← Your documents + annotation data & persistence
└─────────────────────────────────────────┘
```

### How It Works

1. **Beautiful API (`api.py`)**:
   - `agents.for_document(document=123, corpus=1)` provides the elegant entry point.
   - Handles parameter validation, type conversion, and defaults.
   - Routes to the appropriate factory based on framework choice.
   - Similar entry points exist for `embeddings`, `vector_stores`, and `tools`.

2. **Unified Factory (`agents/agent_factory.py`, `vector_stores/vector_store_factory.py`, etc.)**:
   - E.g., `UnifiedAgentFactory.create_document_agent()` orchestrates agent creation.
   - Converts string framework names to enums, resolves tools, creates contexts.
   - Delegates to framework-specific implementations.

3. **Framework Adapters** (e.g., `agents/llama_index_agents.py`):
   - E.g., `LlamaIndexDocumentAgent.create()` builds the actual LLM integration.
   - Creates vector stores, configures embeddings, sets up the underlying LlamaIndex agent.
   - Returns a framework-specific agent that implements the `CoreAgent` protocol.

4. **CoreAgent Protocol (`agents/core_agents.py`)**:
   - The returned agent object (e.g., an instance of `LlamaIndexDocumentAgent`) implements methods like `async def chat(self, message: str)` and `async def stream(self, message: str)`.
   - When you call `await agent.chat("Your query")`, you'''re calling the adapter'''s implementation, which in turn interacts with the underlying LLM SDK.
   - The framework returns rich `UnifiedChatResponse` and `UnifiedStreamResponse` objects with sources, metadata, and message tracking.

5. **Conversation Management**:
   - `CoreConversationManager` handles message persistence and retrieval.
   - Automatically stores user and LLM messages with proper relationships.
   - Supports both persistent (database) and anonymous (memory-only) conversations.

6. **Tool System**:
   - `CoreTool` provides framework-agnostic tool definitions.
   - Framework-specific factories convert tools to appropriate formats.
   - Built-in tools (e.g., via `create_document_tools()`) for document analysis, note retrieval, and content access. Async versions of core tools are often available.

### Framework Support

#### LlamaIndex Integration

```python
# LlamaIndex agents use:
# - ChatEngine for conversation management
# - FunctionTool for tool integration
# - BasePydanticVectorStore for vector search (via LlamaIndexAnnotationVectorStore)
# - Custom embedding models via OpenContractsPipelineEmbedding (from opencontractserver.llms.embedders.custom_pipeline_embedding)

from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
from opencontractserver.llms.vector_stores.llama_index_vector_stores import LlamaIndexAnnotationVectorStore
from opencontractserver.llms.embedders.custom_pipeline_embedding import OpenContractsPipelineEmbedding

# Framework-specific features
# agent = await LlamaIndexDocumentAgent.create(document_obj, corpus_obj, config, conversation_manager, tools)
# The OpenContractsPipelineEmbedding can be configured in AgentConfig or used directly with LlamaIndex components.
```

#### PydanticAI Integration

```python
# PydanticAI agents use:
# - Modern async patterns with proper type safety
# - RunContext for dependency injection
# - Structured tool definitions with Pydantic models
# - Vector search can be integrated as a tool using PydanticAIAnnotationVectorStore.create_vector_search_tool()

from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAIDocumentAgent
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import PydanticAIAnnotationVectorStore

# Framework-specific features
# agent = await PydanticAIDocumentAgent.create(document_obj, corpus_obj, config, conversation_manager, tools)
# vector_search_tool = PydanticAIAnnotationVectorStore(...).create_vector_search_tool()
```

## Advanced Usage

### Custom Configuration

```python
from opencontractserver.llms.agents.core_agents import AgentConfig

# Create custom configuration
config = AgentConfig(
    model="gpt-4-turbo",
    temperature=0.2,
    max_tokens=2000,
    system_prompt="You are an expert legal analyst...",
    embedder_path="sentence-transformers/all-MiniLM-L6-v2",
    tools=["load_md_summary", "get_notes_for_document_corpus"], # Ensure tools are appropriate for context
    verbose=True
)

# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(document=123, corpus=1, config=config) # Use actual document/corpus IDs
```

### Conversation Patterns

#### Multi-turn Analysis

```python
# Persistent conversation for complex analysis
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    user_id=456,
    system_prompt="You are analyzing a legal contract. Build context across multiple questions."
)

# Build context over multiple interactions
overview = await agent.chat("Provide an overview of this contract")
risks = await agent.chat("What are the main risks for the buyer?")
recommendations = await agent.chat("Based on our discussion, what are your recommendations?")

# Access full conversation
info = agent.get_conversation_info()
print(f"Analyzed contract in {info['message_count']} messages")
```

#### Anonymous Sessions

```python
# Anonymous sessions - context maintained in memory only
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(document=123, corpus=1)  # No storage, use actual document/corpus IDs
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("What are the key risks mentioned?")
response3 = await agent.chat("How do these risks compare?")
# Context flows between messages within the same session but is lost when session ends
```

#### Conversation Restoration

```python
# Resume a previous conversation
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    user_id=456,
    conversation_id=789  # Resume existing conversation
)

# Continue where you left off
response = await agent.chat("Following up on our previous discussion...")
```

### Advanced Tool Usage

#### Custom Tool Development

```python
from opencontractserver.llms.tools.tool_factory import CoreTool, ToolMetadata
from typing import List, Dict, Any

async def analyze_contract_clauses(document_id: int, clause_types: List[str]) -> Dict[str, Any]:
    """Analyze specific types of clauses in a contract.
    
    Args:
        document_id: The document to analyze
        clause_types: Types of clauses to look for (e.g., ['''payment''', '''termination'''])
    
    Returns:
        Dictionary with clause analysis results
    """
    # Your custom analysis logic here
    # Ensure this tool has access to the document_id context if needed,
    # or adapt it to receive necessary data directly.
    print(f"Analyzing document {document_id} for clauses: {clause_types}")
    return {
        "found_clauses": clause_types,
        "analysis": "Detailed analysis results...",
        "recommendations": ["Recommendation 1", "Recommendation 2"]
    }

# Create tool with rich metadata
clause_tool = CoreTool(
    function=analyze_contract_clauses, # This is an async function
    metadata=ToolMetadata(
        name="analyze_contract_clauses",
        description="Analyze specific types of clauses in a contract",
        parameter_descriptions={
            "document_id": "The ID of the document to analyze", # Agent context usually provides this
            "clause_types": "List of clause types to search for"
        }
    )
)

# Use in agent
# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(
    document=123, # Use actual document ID or object
    corpus=1,     # Use actual corpus ID or object
    tools=[clause_tool]
)
```

#### Tool Composition

```python
from opencontractserver.llms.tools import create_document_tools # Assuming this is already imported
# from opencontractserver.llms.tools.tool_factory import CoreTool # For custom_tools if defined elsewhere

# Assume clause_tool, risk_tool, compliance_tool are defined CoreTool instances
# For example:
# risk_tool = CoreTool.from_function(...)
# compliance_tool = CoreTool.from_function(...)

# Combine built-in and custom tools
standard_tools = create_document_tools()
# custom_tools = [clause_tool, risk_tool, compliance_tool] # Ensure these are defined

# The '''corpus''' parameter is required for document agents.
# agent = await agents.for_document(
#     document=123, # Use actual document ID or object
#     corpus=1,     # Use actual corpus ID or object
#     tools=standard_tools + custom_tools
# )
```

### Vector Store Integration

#### Advanced Search

The `CoreAnnotationVectorStore` (which underlies framework-specific stores) allows for rich filtering in `VectorSearchQuery`.

```python
from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore, # Typically not instantiated directly by user, but via vector_stores.create()
    VectorSearchQuery
)
# from opencontractserver.llms import vector_stores # For vector_stores.create()

# Example: Creating a store instance (usually done via vector_stores.create())
# store = vector_stores.create(
#     user_id=123,
#     corpus_id=456,
#     embedder_path="sentence-transformers/all-MiniLM-L6-v2" # Handled by config
# )
# For demonstration, let'''s assume '''store''' is an instance of a CoreAnnotationVectorStore compatible store.

# Complex search with filters
# Available filters include Django ORM lookups on Annotation fields,
# and related fields like '''document__title''', '''annotation_label__name'''.
# Also supports: '''label_id''', '''annotation_type''', '''custom_metadata_filters''' (for JSONField queries),
# and '''text_content_filters'''.
query = VectorSearchQuery(
    query_text="payment obligations and penalties",
    similarity_top_k=20,
    filters={
        "annotation_label__name": "payment_clause", # Filter by label name
        "document__title__icontains": "service_agreement", # Filter by document title
        # "custom_metadata_filters": {"client_id": "XYZ"}, # Example for JSONField
        # "annotation_type": "TYPE_A" # Example for annotation type
    }
)

# results = await store.async_search(query) # Assuming store is available

# Process results
# for result in results:
#     annotation = result.annotation
#     print(f"Document: {annotation.document.title}")
#     print(f"Score: {result.similarity_score:.3f}")
#     print(f"Text: {annotation.raw_text[:200]}...")
#     print("---")
```

#### Framework-Specific Vector Stores

```python
# LlamaIndex vector store
from opencontractserver.llms.vector_stores.llama_index_vector_stores import LlamaIndexAnnotationVectorStore

# llama_store = LlamaIndexAnnotationVectorStore(
#     user_id=123, # Optional
#     corpus_id=456 # Or document_id, depending on desired scope
# )

# PydanticAI vector store
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import PydanticAIAnnotationVectorStore

# pydantic_store = PydanticAIAnnotationVectorStore(
#     user_id=123, # Optional
#     corpus_id=456 # Or document_id
# )

# Both provide the same core functionality (search, async_search)
# with framework-specific optimizations and integration patterns.
# Typically created via opencontractserver.llms.vector_stores.create().
```

### Configuration Management

```python
from opencontractserver.llms.agents.core_agents import get_default_config, AgentConfig

# Start with defaults and customize
# For document agents, corpus_id is also relevant for context.
config = get_default_config(
    user_id=123, # Optional
    document_id=456, # Context for default settings
    corpus_id=1 # Context for default settings
)

# Override specific settings
config.model = "gpt-4-turbo"
config.temperature = 0.1
config.system_prompt = "You are a specialized contract analyzer..."

# The '''corpus''' parameter is required for document agents.
agent = await agents.for_document(document=123, corpus=1, config=config) # Use actual document/corpus IDs
```

## Error Handling

The framework provides structured error handling with specific exception types:

```python
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import AgentError
from opencontractserver.documents.models import Document # For Document.DoesNotExist
# from opencontractserver.corpuses.models import Corpus # For Corpus.DoesNotExist

try:
    # The '''corpus''' parameter is required for document agents.
    agent = await agents.for_document(document=999999, corpus=999) # Assuming these don'''t exist
    # response = await agent.chat("Analyze this document")
except Document.DoesNotExist:
    print("Document not found")
# except Corpus.DoesNotExist:
#     print("Corpus not found")
except AgentError as e:
    print(f"Agent error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")

# Graceful handling of LLM errors (example with a hypothetical agent)
# try:
#     response = await agent.chat("Complex query that might fail")
# except Exception as e:
#     # Framework handles LLM errors gracefully
#     print(f"LLM error: {e}")
#     # Conversation state is preserved
```

### Common Error Patterns

```python
# from opencontractserver.documents.models import Document # For Document.DoesNotExist
# from opencontractserver.llms.agents.core_agents import UnifiedStreamResponse # For streaming error
# import logging # For logger
# logger = logging.getLogger(__name__)

# Handle missing documents/corpuses
# async def get_agent_for_doc(document_id, corpus_id):
#     try:
#         agent = await agents.for_document(document=document_id, corpus=corpus_id)
#         return agent
#     except Document.DoesNotExist:
#         return {"error": "Document not found"}
#     except Corpus.DoesNotExist:
#         return {"error": "Corpus not found"}


# Handle conversation errors
# async def process_chat(agent, user_message):
#     try:
#         response = await agent.chat(user_message)
#         return response
#     except Exception as e:
#         # Log error but preserve conversation
#         logger.error(f"Chat error: {e}")
#         return {"error": "Failed to process message", "conversation_id": agent.get_conversation_id()}

# Handle streaming errors
# async def stream_message_handler(agent, message):
#     try:
#         async for chunk in agent.stream(message):
#             yield chunk
#     except Exception as e:
#         # Send error chunk
#         yield UnifiedStreamResponse(
#             content=f"Error: {e}",
#             is_complete=True,
#             error=str(e)
#         )
```

## Performance Considerations

The framework is designed for production use with several performance optimizations:

### Database Optimization

- **Async ORM**: All database operations use Django'''s async ORM capabilities.
- **Prefetch Related**: Vector stores prefetch related objects to avoid N+1 queries.
- **Connection Pooling**: Efficient database connection management (handled by Django).
- **Bulk Operations**: Message storage uses bulk operations where possible.

```python
# Example of optimized queryset in CoreAnnotationVectorStore
# from opencontractserver.annotations.models import Annotation
# queryset = Annotation.objects.select_related(
#     '''document''', '''annotation_label'''
# ).prefetch_related(
#     '''document__doc_type''' # Example of prefetching deeper relation
# ).filter(...)
```

### Caching Strategy

- **Embedding Caching**: Vector embeddings can be cached to avoid recomputation (implementation specific, may depend on embedder).
- **Model Caching**: LLM models are cached and reused across requests (often handled by underlying SDKs like LlamaIndex).
- **Vector Store Caching**: Search results can be cached for repeated queries (application-level or via custom store decorators).

### Memory Management

- **Streaming Responses**: Large responses are streamed to avoid memory issues.
- **Lazy Loading**: Django models use lazy loading for related objects unless explicitly prefetched.
- **Context Windows**: Conversation context is managed within model limits by the agent implementations.

### Source Management

- **Consistent Serialization**: Sources use a unified format across database storage and WebSocket transmission to eliminate conversion overhead.
- **Metadata Flattening**: Source metadata is flattened to top-level fields for efficient access and reduced nesting.
- **Similarity Scores**: All sources include similarity scores for relevance ranking and filtering.
- **Lazy Source Loading**: Sources are only populated when complete responses are available (final streaming chunk).

### Concurrency

- **Async Throughout**: All core operations are async-compatible.
- **Connection Limits**: Proper database connection pooling prevents resource exhaustion.
- **Rate Limiting**: Consider implementing rate limiting at the application or API gateway level for external LLM APIs.

```python
# Example of concurrent agent usage
import asyncio

# async def analyze_documents_concurrently(document_corpus_pairs): # List of (doc_id, corpus_id) tuples
#     agents_list = []
#     for doc_id, corpus_id in document_corpus_pairs:
#         agent = await agents.for_document(document=doc_id, corpus=corpus_id)
#         agents_list.append(agent)
    
#     tasks = [
#         agent.chat("Summarize key points")
#         for agent in agents_list
#     ]
    
#     results = await asyncio.gather(*tasks)
#     return results
```

## Testing

The framework includes comprehensive test coverage:

```python
# Example test patterns
import pytest
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import UnifiedChatResponse
# from opencontractserver.documents.models import Document # For test setup
# from opencontractserver.corpuses.models import Corpus # For test setup

@pytest.mark.asyncio
async def test_document_agent_chat(db, document_factory, corpus_factory): # Assuming db and factories for setup
    # test_corpus = await corpus_factory.create()
    # test_document = await document_factory.create(corpus=test_corpus)
    # agent = await agents.for_document(document=test_document.id, corpus=test_corpus.id)
    # response = await agent.chat("Test message")
    
    # assert isinstance(response, UnifiedChatResponse)
    # assert response.content
    # assert response.user_message_id
    # assert response.llm_message_id
    pass # Placeholder for actual test structure

@pytest.mark.asyncio
async def test_conversation_persistence(db, document_factory, corpus_factory, user_factory): # Assuming factories
    # test_user = await user_factory.create()
    # test_corpus = await corpus_factory.create()
    # test_document = await document_factory.create(corpus=test_corpus)
    # agent = await agents.for_document(
    #     document=test_document.id,
    #     corpus=test_corpus.id,
    #     user_id=test_user.id
    # )
    
    # response1 = await agent.chat("First message")
    # response2 = await agent.chat("Second message")
    
    # # Verify conversation continuity via agent method
    # assert agent.get_conversation_id() is not None
    
    # # Verify message storage
    # info = agent.get_conversation_info()
    # assert info is not None
    # assert info.get('''message_count''', 0) >= 4  # 2 user + 2 LLM messages
    pass # Placeholder for actual test structure
```

## Contributing

The framework is designed for extensibility. Here'''s how to contribute:

### Adding Core Functionality

1. **Core Logic**: Add to `core_*.py` modules (e.g., `agents/core_agents.py`, `tools/core_tools.py`).
2. **Framework Adapters**: Create new adapter in `agents/` (see "Adding a New Framework" below).
3. **Tools**: Add to `tools/core_tools.py` for general tools, or within framework adapters for framework-specific tool handling. Ensure async versions are provided where appropriate.
4. **API**: Extend `api.py` for new high-level functionality if needed (e.g., new API classes like `AgentAPI`, `ToolAPI`).

### Adding a New Framework

To add support for a new LLM framework (e.g., LangChain, Haystack):

1. **Add Framework Enum**:
   ```python
   # In types.py
   class AgentFramework(Enum):
       LLAMA_INDEX = "llama_index"
       PYDANTIC_AI = "pydantic_ai"
       LANGCHAIN = "langchain"  # New framework
   ```

2. **Implement Agent Adapters**:
   - Create `agents/langchain_agents.py`
   - Inside this file, define classes for your document and/or corpus agents. These classes **must** inherit from `CoreAgent` (from `opencontractserver.llms.agents.core_agents.py`).
   
   ```python
   # agents/langchain_agents.py
   from typing import AsyncGenerator # For Python < 3.9, else from collections.abc import AsyncGenerator
   from opencontractserver.llms.agents.core_agents import CoreAgent, AgentContext, AgentConfig, UnifiedChatResponse, UnifiedStreamResponse
   from opencontractserver.llms.conversations.core_conversations import CoreConversationManager
   # from opencontractserver.documents.models import Document
   # from opencontractserver.corpuses.models import Corpus

   class LangChainDocumentAgent(CoreAgent):
       # def __init__(self, context: AgentContext, conversation_manager: CoreConversationManager, underlying_agent: Any):
       #     super().__init__(context, conversation_manager)
       #     self.underlying_agent = underlying_agent
       pass # Simplified for brevity
       
       @classmethod
       async def create(
           cls, 
           # document: Document, 
           # corpus: Corpus, 
           config: AgentConfig, 
           conversation_manager: CoreConversationManager, 
           tools: list = None
       ): # -> "LangChainDocumentAgent":
           # context = AgentContext(document_id=document.id, corpus_id=corpus.id, user_id=config.user_id, config=config)
           # Initialize your LangChain agent here (e.g., langchain_agent = ...)
           # return cls(context, conversation_manager, langchain_agent)
           pass
       
       async def chat(self, message: str, store_messages: bool = True) -> UnifiedChatResponse:
           # Implement chat using your framework
           # user_message_id, llm_message_id = await self._store_request_response_if_needed(...)
           # Return UnifiedChatResponse with proper metadata
           pass
       
       async def stream(self, message: str, store_messages: bool = True) -> AsyncGenerator[UnifiedStreamResponse, None]:
           # Implement streaming using your framework
           # Handle message storage similarly to chat, potentially at the end of the stream.
           # Yield UnifiedStreamResponse chunks
           # if False: # To make it a generator
           #    yield
           pass
   ```

3. **Integrate into `UnifiedAgentFactory`**:
   ```python
   # In agents/agent_factory.py
   # elif framework == AgentFramework.LANGCHAIN:
   #     from opencontractserver.llms.agents.langchain_agents import LangChainDocumentAgent # Or CorpusAgent
   #     if for_document:
   #         return await LangChainDocumentAgent.create(
   #             document=document_obj, # Ensure document_obj and corpus_obj are passed
   #             corpus=corpus_obj,
   #             config=config,
   #             conversation_manager=conversation_manager,
   #             tools=framework_tools
   #         )
   #     else: # for_corpus
   #         # return await LangChainCorpusAgent.create(...)
   #         pass
   pass # Simplified
   ```

4. **Add Tool Support**:
   - Create `tools/langchain_tools.py` if needed.
   - Implement tool conversion from `CoreTool` to your framework'''s tool format.
   - Update `tools/tool_factory.py` (`UnifiedToolFactory`) to handle the new framework.

5. **Add Vector Store Support**:
   - Create `vector_stores/langchain_vector_stores.py`.
   - Implement adapter around `CoreAnnotationVectorStore` or a new core store if needed.
   - Update `vector_stores/vector_store_factory.py`.

6. **Testing**:
   - Create comprehensive tests following the patterns in existing test files (e.g., `test_llama_index_agents.py`, `test_pydantic_ai_agents.py`).
   - Test all `CoreAgent` protocol methods, conversation management, tool usage, and error handling.

By following these steps, you can extend the OpenContracts LLM framework to support new LLM technologies while maintaining the consistent, rich API with conversation management, source tracking, and structured responses.

### Code Style Guidelines

- **Type Hints**: All functions must have complete type hints.
- **Docstrings**: Use Google-style docstrings for all public methods.
- **Async/Await**: Use async patterns consistently throughout. Core functionalities should be async-first.
- **Error Handling**: Provide meaningful error messages and proper exception handling.
- **Testing**: Include comprehensive tests for all new functionality.

### Documentation Standards

- **API Documentation**: Document all public interfaces with examples.
- **Architecture Decisions**: Document significant design choices.
- **Migration Guides**: Provide migration paths for breaking changes.
- **Performance Notes**: Document performance characteristics and limitations.

---

This framework represents the evolution of OpenContracts''' LLM capabilities, providing a foundation for sophisticated document analysis while maintaining simplicity and elegance in its API design.