# OpenContracts LLM Framework

> *"Simplicity is the ultimate sophistication."* - Leonardo da Vinci

A beautiful, framework-agnostic API for creating document and corpus agents that would make a seasoned greybeard tear up with joy.

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
```

That's it. No boilerplate, no configuration hell, no framework lock-in.

## Core API

### Document Agents

```python
# Minimal usage
agent = await agents.for_document(123)
response = await agent.chat("Summarize this document")

# Advanced configuration
agent = await agents.for_document(
    document=my_doc,  # Can be an ID, path, or Document object
    framework="pydantic_ai",  # Or "llama_index"
    model="gpt-4o-mini",  # Specify the LLM model
    system_prompt="You are a legal expert specializing in contract review.",
    tools=["summarize", "extract_entities"], # Built-in or custom tools
    user_id=456, # Optional user ID for conversation tracking
    streaming=True # Enable streaming responses
)
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
    streaming=True
)
async for chunk in agent.stream("Summarize findings from all documents"):
    print(chunk, end="")
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
    mimetype="application/pdf"
    # embedder="custom_embedder_path" # Optionally specify a custom embedder
)
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
    tools=["summarize", clause_extraction_tool] # Can mix built-in tool names and custom tool objects
)
```

## Framework Support

The same API works seamlessly across multiple frameworks:

| Framework | Status | Notes |
|-----------|--------|-------|
| LlamaIndex | ✅ Full Support | Default framework |
| Pydantic AI | ✅ Full Support | Modern, type-safe |
| LangChain | 🚧 Planned | Coming soon |

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
- **API Layer**: The beautiful, simple interface (`agents.for_document`, `embeddings.generate`, etc.) exposed in `opencontractserver.llms.api`.
- **Tool System**: A unified way to define (`CoreTool`) and adapt (`UnifiedToolFactory`) tools for use across different LLM frameworks.
- **Vector Stores**: Support for various vector stores, integrated with Django models.
- **Unified Agent Factory**: (`agents/agent_factory.py`) A central factory that instantiates the correct framework adapter based on user input.

## How It Works: Behind the Scenes

Understanding the flow from an API call to an LLM interaction can be helpful:

1.  **API Call**: You call a function like `await agents.for_document(...)` from `opencontractserver.llms.api`.
    *   This API layer handles basic input validation and prepares parameters.
    *   It then calls the `UnifiedAgentFactory`.

2.  **Unified Agent Factory (`agents/agent_factory.py`)**:
    *   Receives the request (e.g., document ID, desired `framework`, model name, tools).
    *   Constructs a standardized `AgentConfig` object using `get_default_config()` from `core_agents.py`, populating it with user overrides and sensible defaults. This config includes things like `user_id`, `system_prompt`, `model_name`, `streaming` flags, etc.
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

5.  **Interaction & Response**:
    *   The framework adapter handles the interaction with the LLM, including managing conversation history (often by passing messages from the `Conversation` object in the `AgentConfig`).
    *   It returns the response (string or async stream) as defined by the `CoreAgent` protocol.

This layered approach ensures that the top-level API remains simple and consistent, while allowing for different LLM technologies to be plugged in underneath.

## Advanced Features

### Conversation Continuity

Conversations are automatically managed when `user_id` is provided:

```python
agent = await agents.for_document(555, user_id=123)

# First interaction
response1 = await agent.chat("What is the main topic of this contract?")

# Follow-up, context is automatically maintained for this user and document
response2 = await agent.chat("Can you elaborate on section 2.1?")
# Agent remembers the previous conversation associated with user_id and document context
```

### Built-in Tools

Rich set of document tools available by name:

```python
agent = await agents.for_document(
    document=123,
    tools=[
        "summarize",      # Load document summary
        "notes",          # Get document notes  
        "md_summary_length",  # Get summary token count
        "partial_note",   # Get partial note content
    ]
)
```

### Error Handling

Graceful error handling with meaningful messages:

```python
try:
    agent = await agents.for_document(99999)  # Non-existent
except DocumentNotFoundError as e:
    # Handle gracefully
    agent = await agents.for_document(fallback_doc_id)
```

### Type Safety

Full type hints for excellent IDE support:

```python
from opencontractserver.llms import agents # Entry point for agent creation
from opencontractserver.llms.agents.core_agents import CoreAgent # Protocol for agent instances

# Type-safe agent creation using the API
agent: CoreAgent = await agents.for_document(123) # agents.for_document is part of the AgentAPI class
response: str = await agent.chat("Hello")
```

## Examples

See `examples.py` for comprehensive usage examples:

- Simple document chat
- Advanced configuration
- Streaming responses
- Custom tools
- Framework comparison
- Multi-document analysis
- Error handling

## Migration Guide

### From Old API

If you were previously using framework-specific agent creation methods or the older `create_document_agent` directly, migrating to the new unified API is straightforward.

```python
# Old way (example: LlamaIndex specific, or older generic factory)
# from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
# from opencontractserver.llms.agents.core_agents import AgentConfig
# from opencontractserver.llms.agents import create_document_agent # Older factory

# config = AgentConfig(
#     user_id=123,
#     model_name="gpt-4", # Old parameter name
#     system_prompt="Custom prompt",
#     streaming=True
# )
# agent = await LlamaIndexDocumentAgent.create(document_id, config, tools)
# OR
# agent = await create_document_agent(document_id, config, tools) # Old generic factory call

# New way (elegant, framework-agnostic via the new API)
from opencontractserver.llms import agents

agent = await agents.for_document(
    document=document_id, # 'document' can be ID, path, or Document object
    user_id=123,
    model="gpt-4", # New parameter name 'model'
    system_prompt="Custom prompt",
    tools=tools, # List of tool names or CoreTool objects
    streaming=True # streaming is a direct parameter
    # framework="llama_index" # Optional, defaults to llama_index
)
```

### Backward Compatibility

The previous `create_document_agent` and `create_corpus_agent` functions (now found in `opencontractserver.llms.agents`) are still available for backward compatibility. They have been refactored to use the new `UnifiedAgentFactory` internally, defaulting to LlamaIndex.

```python
# Still works (uses the old function now pointing to the new factory with LlamaIndex default)
from opencontractserver.llms.agents import create_document_agent 
agent = await create_document_agent(document_id=document_id) 

# But this is the recommended new API:
from opencontractserver.llms import agents # Import the API module
agent = await agents.for_document(document=document_id)
```

The new `agents.for_document()` and `agents.for_corpus()` methods in `opencontractserver.llms.api` (exposed via `opencontractserver.llms.agents`) provide a more streamlined and flexible interface, and are the preferred way to create agents.

## Performance

- **Lazy Loading**: Components loaded only when needed
- **Connection Pooling**: Efficient database connections
- **Vector Optimization**: pgvector for fast similarity search
- **Streaming**: Real-time response streaming
- **Caching**: Intelligent caching of embeddings and responses

## Testing

```python
import pytest
from opencontractserver.llms import agents

@pytest.mark.asyncio
async def test_document_agent():
    agent = await agents.for_document(test_document_id)
    response = await agent.chat("Test query")
    assert isinstance(response, str)
    assert len(response) > 0
```

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
        from opencontractserver.llms.agents.core_agents import CoreAgent, AgentConfig
        from opencontractserver.documents.models import Document # If creating document agent
        # Import any types your new framework needs

        class MyNewFrameworkDocumentAgent(CoreAgent):
            def __init__(self, framework_specific_engine, config: AgentConfig, tools: list):
                super().__init__(config=config)
                self.engine = framework_specific_engine 
                self.framework_tools = tools
                # ... other initializations ...

            @classmethod
            async def create(cls, document: Document, config: AgentConfig, tools: list) -> "MyNewFrameworkDocumentAgent":
                # Initialize your framework's engine/client here
                # Use document, config (config.model_name, config.system_prompt, etc.), and tools
                # Example:
                # framework_engine = await setup_my_new_framework_engine(
                #     document_content=document.text_content,
                #     model=config.model_name,
                #     system_prompt=config.system_prompt,
                #     framework_specific_tools=tools 
                # )
                # return cls(framework_engine, config, tools)
                pass # Replace with actual implementation

            async def chat(self, message: str, **kwargs) -> str:
                # Implement chat logic using self.engine and self.framework_tools
                # Manage conversation history using self.config.conversation
                # Return the string response
                pass # Replace with actual implementation

            async def stream(self, message: str, **kwargs):
                # Implement streaming logic
                # Yield chunks of the response
                pass # Replace with actual implementation
            
            # ... implement other required CoreAgent methods ...
            # (e.g., get_conversation_messages, add_user_message, add_assistant_message)

        # Optionally, create a MyNewFrameworkCorpusAgent similarly
        ```
    *   Ensure your `create` method handles all necessary setup for your framework and returns an instance of your agent class.
    *   Implement all abstract methods defined in `CoreAgent`.

3. **Integrate into `UnifiedAgentFactory`**:
    *   Open `opencontractserver/llms/agents/agent_factory.py`.
    *   Import your new agent adapter class(es) at the top of the file.
        ```python
        # Example import
        # from opencontractserver.llms.agents.my_new_framework_agents import MyNewFrameworkDocumentAgent 
        ```
    *   In the `UnifiedAgentFactory.create_document_agent` method (and `create_corpus_agent` if applicable), add an `elif` block to handle your new framework:
        ```python
        # Inside create_document_agent method:
        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
            return await LlamaIndexDocumentAgent.create(document, config, framework_tools)
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAIDocumentAgent
            return await PydanticAIDocumentAgent.create(document, config, framework_tools)
        elif framework == AgentFramework.MY_NEW_FRAMEWORK: # Your new block
            from opencontractserver.llms.agents.my_new_framework_agents import MyNewFrameworkDocumentAgent # Ensure this import is here or at top
            return await MyNewFrameworkDocumentAgent.create(document, config, framework_tools)
        else:
            raise ValueError(f"Unsupported framework: {framework}")
        ```

4. **Implement Tool Conversion (If Needed)**:
    *   The `_convert_tools_for_framework` function in `agent_factory.py` calls `UnifiedToolFactory.create_tools` (from `tools/tool_factory.py`).
    *   If your new framework requires tools in a unique format not already handled by `UnifiedToolFactory`:
        *   Open `opencontractserver/llms/tools/tool_factory.py`.
        *   Modify `UnifiedToolFactory.create_tools` to add a condition for your `AgentFramework.MY_NEW_FRAMEWORK`.
        *   In this condition, convert the list of `CoreTool` objects into the format expected by your framework.
        ```python
        # Inside UnifiedToolFactory.create_tools
        # ...
        if framework == AgentFramework.MY_NEW_FRAMEWORK:
            # Convert each core_tool in core_tools to your framework's format
            # Example: framework_specific_tools.append(convert_to_my_format(core_tool))
            pass # Replace with actual implementation
        # ...
        ```

5. **Documentation & Examples**:
    *   Update the "Framework Support" table in this `README.md` file to include your new framework, its status, and any relevant notes.
    *   If your framework has unique setup steps or common usage patterns, consider adding examples to `examples.py` or a dedicated documentation section.

6. **Testing**:
    *   Thoroughly test your new integration. Write unit tests for your agent adapter class(es) in `opencontractserver/tests/llms/agents/`.
    *   Ensure your adapter correctly implements all aspects of the `CoreAgent` protocol and interacts with your chosen LLM framework as expected.
    *   Test tool usage, conversation history, streaming, and error handling.

By following these steps, you can extend the OpenContracts LLM framework to support a wider range of LLM technologies while maintaining a consistent and simple API for users.

## Design Principles

This framework follows these principles:

1. **Convention over Configuration**: Sensible defaults
2. **Explicit over Implicit**: Clear, readable code
3. **Simple over Complex**: Minimal cognitive load
4. **Consistent over Clever**: Predictable patterns
5. **Extensible over Rigid**: Easy to extend

## Why This API is Beautiful

- **One-liner creation**: `agent = await agents.for_document(123)`
- **Framework agnostic**: Same code, different engines
- **Type safe**: Full IDE support with hints
- **Self-documenting**: Clear, descriptive method names
- **Composable**: Mix and match tools, frameworks, configs
- **Testable**: Easy to mock and test
- **Maintainable**: Clear separation of concerns

This is what elegant software looks like. Simple on the surface, sophisticated underneath.

---

*"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."* - Antoine de Saint-Exupéry 