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
    document=my_doc,
    framework="pydantic_ai",
    model="gpt-4",
    system_prompt="You are a legal expert...",
    tools=["summarize", "extract_entities"],
    user_id=456
)
```

### Corpus Agents

```python
# Analyze a collection of documents
agent = await agents.for_corpus(456)
response = await agent.chat("What are the key themes?")

# With streaming
agent = await agents.for_corpus(456, framework="pydantic_ai")
async for chunk in agent.stream("Summarize findings"):
    print(chunk, end="")
```

### Embeddings

```python
from opencontractserver.llms import embeddings

# Simple embedding
embedder_path, vector = embeddings.generate("Hello world")

# Context-aware embedding
embedder_path, vector = embeddings.generate(
    "Legal document text",
    corpus_id=123,
    mimetype="application/pdf"
)
```

### Custom Tools

```python
from opencontractserver.llms import tools

# Create tool from function
def extract_financial_data(document_id: int) -> str:
    """Extract financial information from a document."""
    return f"Financial data for document {document_id}"

financial_tool = tools.from_function(extract_financial_data)

# Use with agent
agent = await agents.for_document(
    document=789,
    tools=["summarize", financial_tool]
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

This framework uses a layered architecture that separates concerns beautifully:

```
┌─────────────────────────────────────────┐
│           Beautiful API Layer           │  ← You are here
├─────────────────────────────────────────┤
│        Framework Adapter Layer         │  ← LlamaIndex, Pydantic AI
├─────────────────────────────────────────┤
│         Core Business Logic            │  ← Framework-agnostic
├─────────────────────────────────────────┤
│      Django Models & Vector Stores     │  ← Your data
└─────────────────────────────────────────┘
```

### Key Components

- **Core Layer**: Framework-agnostic business logic
- **Adapter Layer**: Thin wrappers for specific frameworks  
- **API Layer**: Beautiful, simple interface
- **Tool System**: Unified tool creation and conversion
- **Vector Stores**: Multi-dimensional embedding support

## Advanced Features

### Conversation Continuity

Conversations are automatically managed:

```python
agent = await agents.for_document(555, user_id=123)

# First interaction
response1 = await agent.chat("What is the main topic?")

# Follow-up with context
response2 = await agent.chat("Can you elaborate on that?")
# Agent remembers the previous conversation
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
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import CoreAgent

# Type-safe agent creation
agent: CoreAgent = await agents.for_document(123)
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

```python
# Old way (verbose, framework-specific)
from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
from opencontractserver.llms.agents.core_agents import AgentConfig

config = AgentConfig(
    user_id=123,
    model_name="gpt-4",
    system_prompt="Custom prompt",
    streaming=True
)
agent = await LlamaIndexDocumentAgent.create(document_id, config, tools)

# New way (elegant, framework-agnostic)
from opencontractserver.llms import agents

agent = await agents.for_document(
    document=document_id,
    user_id=123,
    model="gpt-4", 
    system_prompt="Custom prompt"
)
```

### Backward Compatibility

The old API still works, but the new API is recommended:

```python
# Still works
from opencontractserver.llms.agents import create_document_agent
agent = await create_document_agent(document_id)

# But this is better
from opencontractserver.llms import agents
agent = await agents.for_document(document_id)
```

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

1. **Core Logic**: Add to `core_*.py` modules
2. **Framework Adapters**: Create new adapter in `agents/` 
3. **Tools**: Add to `tools/core_tools.py`
4. **API**: Extend `api.py` for new functionality

### Adding a New Framework

```python
# 1. Create adapter
class MyFrameworkAgent(CoreAgent):
    async def chat(self, message: str) -> str:
        # Implementation
        pass

# 2. Register in factory
if framework == AgentFramework.MY_FRAMEWORK:
    return await MyFrameworkAgent.create(...)

# 3. Add to enum
class AgentFramework(Enum):
    MY_FRAMEWORK = "my_framework"
```

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