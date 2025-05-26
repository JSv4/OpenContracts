# OpenContracts LLM Framework

OpenContract's API for creating document and corpus agents.

## Philosophy

This framework embodies the principles of elegant software design:

- **Simplicity**: Complex tasks should be simple to express
- **Consistency**: Same patterns work across all frameworks
- **Extensibility**: Easy to add new frameworks and tools
- **Type Safety**: Full TypeScript-level typing in Python
- **DRY**: Don't repeat yourself, ever

## Quick Start

```python
from opencontractserver.llms import agents

# Create a document agent with one line
agent = await agents.for_document(123)
response = await agent.chat("What is this document about?")
print(response.content)  # Access the response content
print(response.sources)  # View sources used for the response
```

That's it. No boilerplate, no configuration hell, no framework lock-in.

## Dependencies

Key dependencies automatically handled:
- `nest_asyncio` - For nested event loop support
- `llama_index` - LlamaIndex framework (if using)
- `pydantic_ai` - PydanticAI framework (if using)
- `django` - Database models and ORM

The framework automatically applies `nest_asyncio.apply()` for compatibility.

## Core API

### Document Agents

```python
# Minimal usage
agent = await agents.for_document(123)
response = await agent.chat("Summarize this document")

# Advanced configuration with conversation management
agent = await agents.for_document(
    document=my_doc,  # Can be an ID, path, or Document object
    framework="pydantic_ai",  # Or "llama_index", or AgentFramework enum
    model="gpt-4o-mini",  # Specify the LLM model
    system_prompt="You are a legal expert specializing in contract review.",
    tools=["load_md_summary", "get_notes"], # Built-in or custom tools
    user_id=456, # Optional user ID for conversation tracking
    conversation_id=789,  # Continue existing conversation
    streaming=True # Enable streaming responses
)

# Framework specification - these are equivalent
agent = await agents.for_document(123, framework="llama_index")
agent = await agents.for_document(123, framework=AgentFramework.LLAMA_INDEX)
```

### Response Types

The framework now returns structured response objects with rich metadata:

```python
# Chat responses include content, sources, and message tracking
response = await agent.chat("What is this about?")
print(response.content)           # The LLM's response text
print(response.sources)           # List of SourceNode objects with annotations
print(response.user_message_id)   # ID of stored user message
print(response.llm_message_id)    # ID of stored LLM response
print(response.metadata)          # Additional metadata (framework info, etc.)

# Streaming responses provide real-time updates
async for chunk in agent.stream("Analyze this document"):
    print(chunk.content, end="")           # Current chunk
    print(f"Total: {chunk.accumulated_content}")  # Full response so far
    if chunk.is_complete:
        print(f"Sources: {chunk.sources}")  # Final sources when complete
```

### Enhanced Conversation Management

The framework provides sophisticated conversation continuity and message management:

```python
# Anonymous conversations (ephemeral, not stored in database)
agent = await agents.for_document(123)  # No user_id = anonymous
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained in memory

# Anonymous conversations are session-only and not persisted
conversation_id = agent.get_conversation_id()  # Returns None for anonymous
conversation_info = agent.get_conversation_info()  # Returns basic info with no persistence

# Important: Anonymous conversations cannot be restored later
# new_agent = await agents.for_document(123, conversation_id=None)  # Will start fresh

# User-tracked conversations (recommended for production - fully persistent)
agent = await agents.for_document(
    document=555,
    user_id=123,  # Required for persistence
    conversation_id=456  # Continue from specific conversation
)

# Continue the same conversation later (only works with user_id)
new_agent = await agents.for_document(555, user_id=123, conversation_id=456)
response3 = await new_agent.chat("What about section 3?")  # Continues from database

# Load existing messages for context (only for authenticated users)
existing_messages = await ChatMessage.objects.filter(conversation_id=456).all()
agent = await agents.for_document(
    document=555,
    user_id=123,
    messages=existing_messages  # Pre-load conversation history
)

# Access conversation history programmatically (only for persistent conversations)
messages = await agent.get_conversation_messages()  # Empty list for anonymous
for msg in messages:
    print(f"{msg.msg_type}: {msg.content}")
```

### Conversation Persistence Models

The framework supports two distinct conversation models:

```python
# 1. Anonymous/Ephemeral Conversations (Session-only)
# - No database storage
# - No conversation continuity across sessions  
# - Perfect for testing, demos, or privacy-sensitive scenarios
agent = await agents.for_document(123)  # user_id=None
response = await agent.chat("Quick question")
# conversation_id will be None - nothing stored

# 2. Persistent Conversations (Database-stored)
# - Full conversation history stored
# - Can be continued across sessions
# - Message tracking and state management
# - Requires user authentication
agent = await agents.for_document(123, user_id=456)
response = await agent.chat("Important discussion")
conversation_id = agent.get_conversation_id()  # Real ID for restoration

# Later session - restore conversation
agent = await agents.for_document(123, user_id=456, conversation_id=conversation_id)
response = await agent.chat("Continue where we left off")
```

### Long Conversation Sessions

The API handles long conversations differently based on persistence model:

```python
# Anonymous sessions - context maintained in memory only
agent = await agents.for_document(123)  # No storage
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("What are the key risks mentioned?")
response3 = await agent.chat("How do these risks compare?")
# Context flows between messages within the same session but is lost when session ends

# Persistent sessions - full database storage
agent = await agents.for_document(123, user_id=456)  # With storage
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("What are the key risks mentioned?")
response3 = await agent.chat("How do these risks compare?")

# All messages are stored and can be retrieved
conversation_id = agent.get_conversation_id()
print(f"Conversation {conversation_id} has {len(await agent.get_conversation_messages())} messages")

# Continue later in a new session
later_agent = await agents.for_document(123, user_id=456, conversation_id=conversation_id)
response4 = await later_agent.chat("Can you summarize our entire discussion?")
# Full context from database
```

### Corpus Agents

```python
# Analyze a collection of documents
agent = await agents.for_corpus(corpus_id=456) # corpus_id is required
response = await agent.chat("What are the key themes across these documents?")

# With streaming and custom model
agent = await agents.for_corpus(
    corpus_id=456, 
    framework="pydantic_ai",
    model="claude-3-sonnet",
    streaming=True,
    conversation_id=123  # Continue existing conversation
)
async for chunk in agent.stream("Summarize findings from all documents"):
    print(chunk.content, end="")
```

### Embeddings

```python
from opencontractserver.llms import embeddings

# Simple embedding
embedder_path, vector = embeddings.generate("Text to be embedded.")

# Context-aware embedding for a specific corpus and mimetype
embedder_path, vector = embeddings.generate(
    "Some legal text from a PDF document.",
    corpus_id=123,
    mimetype="application/pdf",
    embedder_path="custom/model"  # Optionally specify a custom embedder
)
```

### Vector Stores

```python
from opencontractserver.llms import vector_stores

# Basic vector store
store = vector_stores.create(framework="llama_index")

# Full configuration
store = vector_stores.create(
    framework="llama_index",
    user_id=1,
    corpus_id=456,
    document_id=123,  # Optional: restrict to specific document
    embedder_path="custom/embedder",
    must_have_text="required_text",
    embed_dim=768,
    # Framework-specific options
    **kwargs
)

# Query the store
results = store.query("search text")
```

#### Response Types

Vector stores return framework-specific response types:

```python
# LlamaIndex
results = store.query("search text")  # Returns VectorStoreQueryResult

# PydanticAI  
results = await store.search_annotations("search text")  # Returns PydanticAIVectorSearchResponse

# Core (framework-agnostic)
core_store = vector_stores.create_core_vector_store()
results = core_store.search(query)  # Returns List[VectorSearchResult]
```

### Custom Tools

```python
from opencontractserver.llms import tools

# Create tool from function
def extract_clause_references(document_id: int, clause_type: str) -> str:
    """Extracts all references to a specific clause type from the document."""
    # Actual implementation would go here
    return f"Found references to '{clause_type}' in document {document_id}"

# Tool automatically infers name and description from the function
clause_extraction_tool = tools.from_function(extract_clause_references)

# Use with agent
agent = await agents.for_document(
    document=789,
    tools=["load_md_summary", clause_extraction_tool] # Can mix built-in tool names and custom tool objects
)
```

## Framework Support

The same API works seamlessly across multiple frameworks:

| Framework | Status | Notes |
|-----------|--------|-------|
| LlamaIndex | ✅ Full Support | Default framework |
| Pydantic AI | ✅ Production Ready | Full conversation management, streaming, sources |
| LangChain | 🚧 Planned | Coming soon |

> **Note**: PydanticAI support is now production ready with full conversation management, streaming responses, and source tracking.

Switch frameworks with a single parameter:

```python
# LlamaIndex
agent = await agents.for_document(123, framework="llama_index")

# Pydantic AI  
agent = await agents.for_document(123, framework="pydantic_ai")

# Same interface, different engine
```

## Architecture

This framework uses a layered architecture that separates concerns:

```
┌─────────────────────────────────────────┐
│        OpenContracts LLM API            │  ← You are here (api.py)
│  (agents.for_document(), .for_corpus()) │
├─────────────────────────────────────────┤
│       Unified Agent Factory             │  ← agents/agent_factory.py
│  (Handles framework dispatch & config)  │
├─────────────────────────────────────────┤
│        Framework Adapter Layer          │  ← e.g., agents/llama_index_agents.py
│ (Implements CoreAgent for specific SDK) │
├─────────────────────────────────────────┤
│         Core Agent Protocol             │  ← agents/core_agents.py (Defines .chat, .stream)
│         & Unified Tool System           │  ← tools/ (CoreTool, UnifiedToolFactory)
├─────────────────────────────────────────┤
│         Core Business Logic             │  ← Framework-agnostic utils, config
├─────────────────────────────────────────┤
│      Django Models & Vector Stores      │  ← Your documents + annotation data & persistence
└─────────────────────────────────────────┘
```

### Key Components

- **Core Layer**: Framework-agnostic business logic, type definitions, and base configurations.
- **Adapter Layer**: Thin wrappers (e.g., `LlamaIndexDocumentAgent`) for specific LLM frameworks. These implement the `CoreAgent` protocol.
- **API Layer**: The simple interface (`agents.for_document`, `embeddings.generate`, etc.) exposed in `opencontractserver.llms.api`.
- **Tool System**: A unified way to define (`CoreTool`) and adapt (`UnifiedToolFactory`) tools for use across different LLM frameworks.
- **Vector Stores**: Support for various vector stores, integrated with Django models.
- **Unified Agent Factory**: (`agents/agent_factory.py`) A central factory that instantiates the correct framework adapter based on user input.
- **Message Management**: Sophisticated conversation and message lifecycle management with state tracking.

## How It Works: Behind the Scenes

Understanding the flow from an API call to an LLM interaction can be helpful:

1.  **API Call**: You call a function like `await agents.for_document(...)` from `opencontractserver.llms.api`.
    *   This API layer handles basic input validation and prepares parameters.
    *   It then calls the `UnifiedAgentFactory`.

2.  **Unified Agent Factory (`agents/agent_factory.py`)**:
    *   Receives the request (e.g., document ID, desired `framework`, model name, tools).
    *   Constructs a standardized `AgentConfig` object using `get_default_config()` from `core_agents.py`, populating it with user overrides and sensible defaults. This config includes things like `user_id`, `system_prompt`, `model_name`, `streaming` flags, conversation management, etc.
    *   **Tool Processing**: If tools are provided (as strings, functions, or `CoreTool` objects):
        *   Functions are first converted to `CoreTool` instances.
        *   `UnifiedToolFactory.create_tools()` (from `tools/tool_factory.py`) is called. This factory is responsible for converting the list of `CoreTool` objects into the specific format expected by the target LLM framework (e.g., LlamaIndex `ToolMetadata` objects, Pydantic AI compatible functions).
    *   **Framework Dispatch**: Based on the `framework` parameter, the factory imports and calls the `.create()` class method of the appropriate framework-specific agent adapter (e.g., `LlamaIndexDocumentAgent.create(...)` or `PydanticAIDocumentAgent.create(...)`).

3.  **Framework Adapter (e.g., `agents/llama_index_agents.py`)**:
    *   These classes (e.g., `LlamaIndexDocumentAgent`, `PydanticAIDocumentAgent`) inherit from `CoreAgent`.
    *   The `async def create(...)` class method initializes the specific LLM framework's components (e.g., LlamaIndex query engine, Pydantic AI agent instance). It uses the provided `AgentConfig` and the now framework-specific tools.
    *   It sets up data sources (like document indexes or corpus retrievers) relevant to the agent type.
    *   An instance of this adapter is returned, now conforming to the `CoreAgent` protocol.

4.  **CoreAgent Protocol (`agents/core_agents.py`)**:
    *   The returned agent object (e.g., an instance of `LlamaIndexDocumentAgent`) implements methods like `async def chat(self, message: str)` and `async def stream(self, message: str)`.
    *   When you call `await agent.chat("Your query")`, you're calling the adapter's implementation, which in turn interacts with the underlying LLM SDK (e.g., makes a query to a LlamaIndex engine).
    *   The framework now returns rich `UnifiedChatResponse` and `UnifiedStreamResponse` objects with sources, metadata, and message tracking.

5.  **Conversation Management**:
    *   The `CoreConversationManager` handles sophisticated message lifecycle management.
    *   Messages are stored with state tracking (`IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `ERROR`).
    *   Source annotations are properly tracked and stored with responses.
    *   Conversation continuity is maintained across interactions.

6.  **Interaction & Response**:
    *   The framework adapter handles the interaction with the LLM, including managing conversation history from the `Conversation` object in the `AgentConfig`.
    *   It returns structured response objects with content, sources, and metadata as defined by the enhanced `CoreAgent` protocol.

This layered approach ensures that the top-level API remains simple and consistent, while providing rich functionality and allowing for different LLM technologies to be plugged in underneath.

## Advanced Features

### Enhanced Conversation Management

The framework provides sophisticated conversation continuity and message management:

```python
# Anonymous conversations (ephemeral, not stored in database)
agent = await agents.for_document(123)  # No user_id = anonymous
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained in memory

# Anonymous conversations are session-only and not persisted
conversation_id = agent.get_conversation_id()  # Returns None for anonymous
conversation_info = agent.get_conversation_info()  # Returns basic info with no persistence

# Important: Anonymous conversations cannot be restored later
# new_agent = await agents.for_document(123, conversation_id=None)  # Will start fresh

# User-tracked conversations (recommended for production - fully persistent)
agent = await agents.for_document(
    document=555,
    user_id=123,  # Required for persistence
    conversation_id=456  # Continue from specific conversation
)

# Continue the same conversation later (only works with user_id)
new_agent = await agents.for_document(555, user_id=123, conversation_id=456)
response3 = await new_agent.chat("What about section 3?")  # Continues from database

# Load existing messages for context (only for authenticated users)
existing_messages = await ChatMessage.objects.filter(conversation_id=456).all()
agent = await agents.for_document(
    document=555,
    user_id=123,
    messages=existing_messages  # Pre-load conversation history
)

# Access conversation history programmatically (only for persistent conversations)
messages = await agent.get_conversation_messages()  # Empty list for anonymous
for msg in messages:
    print(f"{msg.msg_type}: {msg.content}")
```

### Conversation Persistence Models

The framework supports two distinct conversation models:

```python
# 1. Anonymous/Ephemeral Conversations (Session-only)
# - No database storage
# - No conversation continuity across sessions  
# - Perfect for testing, demos, or privacy-sensitive scenarios
agent = await agents.for_document(123)  # user_id=None
response = await agent.chat("Quick question")
# conversation_id will be None - nothing stored

# 2. Persistent Conversations (Database-stored)
# - Full conversation history stored
# - Can be continued across sessions
# - Message tracking and state management
# - Requires user authentication
agent = await agents.for_document(123, user_id=456)
response = await agent.chat("Important discussion")
conversation_id = agent.get_conversation_id()  # Real ID for restoration

# Later session - restore conversation
agent = await agents.for_document(123, user_id=456, conversation_id=conversation_id)
response = await agent.chat("Continue where we left off")
```

### Long Conversation Sessions

The API handles long conversations differently based on persistence model:

```python
# Anonymous sessions - context maintained in memory only
agent = await agents.for_document(123)  # No storage
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("What are the key risks mentioned?")
response3 = await agent.chat("How do these risks compare?")
# Context flows between messages within the same session but is lost when session ends

# Persistent sessions - full database storage
agent = await agents.for_document(123, user_id=456)  # With storage
response1 = await agent.chat("What is this document about?")
response2 = await agent.chat("What are the key risks mentioned?")
response3 = await agent.chat("How do these risks compare?")

# All messages are stored and can be retrieved
conversation_id = agent.get_conversation_id()
print(f"Conversation {conversation_id} has {len(await agent.get_conversation_messages())} messages")

# Continue later in a new session
later_agent = await agents.for_document(123, user_id=456, conversation_id=conversation_id)
response4 = await later_agent.chat("Can you summarize our entire discussion?")
# Full context from database
```

### Message State Tracking

All messages are tracked with detailed state information:

```python
response = await agent.chat("Analyze this document")

# Access message metadata
print(f"User message ID: {response.user_message_id}")
print(f"LLM message ID: {response.llm_message_id}")

# Messages have states: IN_PROGRESS, COMPLETED, CANCELLED, ERROR
# Automatically managed during the conversation lifecycle
```

### Source Tracking and Citations

Responses include detailed source information:

```python
response = await agent.chat("What are the key points in this document?")

for source in response.sources:
    print(f"Annotation ID: {source.annotation_id}")
    print(f"Content: {source.content}")
    print(f"Similarity Score: {source.similarity_score}")
    print(f"Metadata: {source.metadata}")
```

### Built-in Tools

Rich set of document tools available by name:

```python
agent = await agents.for_document(
    document=123,
    tools=[
        "load_md_summary",              # Load document summary
        "load_document_md_summary",     # Alias for load_md_summary
        "get_notes",                    # Get document notes  
        "get_notes_for_document_corpus", # Alias for get_notes
        "md_summary_length",            # Get summary token count
        "get_md_summary_token_length",  # Alias for md_summary_length
        "note_content_length",          # Get note token count
        "get_note_content_token_length", # Alias for note_content_length
        "partial_note_content",         # Get partial note content
        "get_partial_note_content",     # Alias for partial_note_content
    ]
)
```

### Async Tool Variants

Most core tools have async equivalents with an `a` prefix:

```python
# Async versions available for:
# - aload_document_md_summary()
# - aget_notes_for_document_corpus()
# - aget_note_content_token_length()
# - aget_partial_note_content()
```

### Configuration Options

Full configuration using `AgentConfig`:

```python
from opencontractserver.llms.agents.core_agents import AgentConfig

config = AgentConfig(
    model_name="gpt-4o-mini",
    temperature=0.7,
    max_tokens=4000,
    system_prompt="Custom prompt",
    conversation=existing_conversation,  # Continue existing conversation
    conversation_id=456,                 # Or specify by ID
    loaded_messages=existing_messages,   # Pre-load message history
    embedder_path="custom/embedder",     # Custom embedding model
    tools=[custom_tool],
    streaming=True,
    store_user_messages=True,            # Control message storage
    store_llm_messages=True,
)

agent = await agents.for_document(123, config=config)
```

## Error Handling

The framework provides structured error handling:

```python
from opencontractserver.llms import agents

try:
    agent = await agents.for_document(999999)  # Non-existent document
except ValueError as e:
    print(f"Document not found: {e}")

try:
    response = await agent.chat("Hello")
except FileNotFoundError as e:
    print(f"Missing document file or summary: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

Common exceptions:
- `ValueError`: Invalid document/corpus IDs, configuration errors
- `FileNotFoundError`: Missing document files or summaries
- Database connection errors are handled gracefully with proper async ORM usage

## Testing

```python
import pytest
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import UnifiedChatResponse

@pytest.mark.asyncio
async def test_document_agent():
    agent = await agents.for_document(test_document_id)
    response = await agent.chat("Test query")
    assert isinstance(response, UnifiedChatResponse)
    assert len(response.content) > 0
    assert response.user_message_id is not None
    assert response.llm_message_id is not None
```

## Examples

See `examples.py` for comprehensive usage examples:

- Simple document chat
- Advanced configuration
- Streaming responses with source tracking
- Custom tools
- Framework comparison
- Multi-document analysis
- Conversation management
- Error handling

## Migration from Legacy API

### Old Agent Creation

```python
# Old way (still works)
from opencontractserver.llms.agents import create_document_agent, create_corpus_agent
agent = await create_document_agent(doc_id)
corpus_agent = await create_corpus_agent(corpus_id)

# New way (recommended)
from opencontractserver.llms import agents
agent = await agents.for_document(doc_id)
corpus_agent = await agents.for_corpus(corpus_id)
```

### Response Type Changes

```python
# Old way - simple string responses
response = await agent.chat("Hello")  # Returns str
print(response)

# New way - structured response objects
response = await agent.chat("Hello")  # Returns UnifiedChatResponse
print(response.content)  # Access content
print(response.sources)  # Access sources
print(response.metadata)  # Access metadata
```

### Legacy Vector Stores

```python
# Old way
from opencontractserver.llms.vector_stores.vector_stores import DjangoAnnotationVectorStore

# New way
from opencontractserver.llms import vector_stores
store = vector_stores.create(framework="llama_index")
```

### Parameter Changes

```python
# Old configuration style
config = AgentConfig(
    model_name="gpt-4",  # Old parameter name
    # ... other config
)

# New configuration style
agent = await agents.for_document(
    document=document_id,
    model="gpt-4",  # New parameter name
    # ... other params
)
```

### Backward Compatibility

The previous `create_document_agent` and `create_corpus_agent` functions are still available for backward compatibility. They have been refactored to use the new `UnifiedAgentFactory` internally, defaulting to LlamaIndex.

Legacy `.stream_chat()` methods are still available but return the new structured response objects.

## Performance

- **Lazy Loading**: Components loaded only when needed
- **Connection Pooling**: Efficient database connections
- **Vector Optimization**: pgvector for fast similarity search
- **Streaming**: Real-time response streaming with proper async handling
- **Caching**: Intelligent caching of embeddings and responses
- **Message Lifecycle**: Optimized message storage with atomic operations
- **Async ORM**: Proper async database operations throughout

## Contributing

1. **Core Logic**: Add to `core_*.py` modules (e.g., `agents/core_agents.py`, `tools/core_tools.py`).
2. **Framework Adapters**: Create new adapter in `agents/` (see "Adding a New Framework" below).
3. **Tools**: Add to `tools/core_tools.py` for general tools, or within framework adapters for framework-specific tool handling.
4. **API**: Extend `api.py` for new high-level functionality if needed.

### Adding a New Framework

Here's a step-by-step guide to integrate a new LLM framework into OpenContracts:

1. **Define Framework Enum**:
    *   Open `opencontractserver/llms/types.py`.
    *   Add a new unique value to the `AgentFramework` enum. For example:
        ```python
        class AgentFramework(Enum):
            LLAMA_INDEX = "llama_index"
            PYDANTIC_AI = "pydantic_ai"
            MY_NEW_FRAMEWORK = "my_new_framework" # Your new framework
        ```

2. **Implement Agent Adapters**:
    *   Create a new Python file in the `opencontractserver/llms/agents/` directory. Name it descriptively, e.g., `my_new_framework_agents.py`.
    *   Inside this file, define classes for your document and/or corpus agents. These classes **must** inherit from `CoreAgent` (from `opencontractserver.llms.agents.core_agents.py`).
        ```python
        from opencontractserver.llms.agents.core_agents import (
            CoreAgent, AgentConfig, UnifiedChatResponse, UnifiedStreamResponse,
            CoreConversationManager, DocumentAgentContext
        )
        from opencontractserver.documents.models import Document

        class MyNewFrameworkDocumentAgent(CoreAgent):
            def __init__(self, context: DocumentAgentContext, conversation_manager: CoreConversationManager, config: AgentConfig):
                self.context = context
                self.conversation_manager = conversation_manager 
                self.config = config
                # Initialize your framework components

            @classmethod
            async def create(cls, document: Document, config: AgentConfig, tools: list) -> "MyNewFrameworkDocumentAgent":
                # Create context and conversation manager
                context = await CoreDocumentAgentFactory.create_context(document, config)
                conversation_manager = await CoreConversationManager.create_for_document(
                    context.document, config.user_id, config
                )
                return cls(context, conversation_manager, config)

            async def chat(self, message: str, store_messages: bool = True) -> UnifiedChatResponse:
                # Implement using the enhanced conversation management pattern
                user_msg_id = None
                llm_msg_id = None
                
                try:
                    if store_messages and self.conversation_manager.config.store_user_messages:
                        user_msg_id = await self.conversation_manager.store_user_message(message)

                    if store_messages and self.conversation_manager.config.store_llm_messages:
                        llm_msg_id = await self.conversation_manager.create_placeholder_message("LLM")

                    # Your framework logic here
                    content = "Your response"
                    sources = []  # List of SourceNode objects

                    if llm_msg_id:
                        await self.conversation_manager.complete_message(
                            llm_msg_id, content, sources, {"framework": "my_framework"}
                        )

                    return UnifiedChatResponse(
                        content=content,
                        sources=sources,
                        user_message_id=user_msg_id,
                        llm_message_id=llm_msg_id,
                        metadata={"framework": "my_framework"}
                    )
                except Exception as e:
                    if llm_msg_id:
                        await self.conversation_manager.cancel_message(llm_msg_id, f"Error: {str(e)}")
                    raise

            async def stream(self, message: str, store_messages: bool = True) -> AsyncGenerator[UnifiedStreamResponse, None]:
                # Implement streaming with the same pattern
                # Return UnifiedStreamResponse objects
                pass

            # Implement other required CoreAgent methods...
        ```

3. **Integrate into `UnifiedAgentFactory`**:
    *   Open `opencontractserver/llms/agents/agent_factory.py`.
    *   Add your framework to the factory's dispatch logic.

4. **Update Documentation**:
    *   Update the "Framework Support" table in this README.
    *   Add examples and usage patterns specific to your framework.

5. **Testing**:
    *   Create comprehensive tests following the patterns in `test_pydantic_ai_agents.py`.
    *   Test all CoreAgent protocol methods, conversation management, and error handling.

By following these steps, you can extend the OpenContracts LLM framework to support new LLM technologies while maintaining the consistent, rich API with conversation management, source tracking, and structured responses.

---
