# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenContracts is a GPL-3 enterprise document analytics platform that supports PDF and text-based document analysis with a pluggable architecture. It combines Django backend with React frontend to provide document annotation, vector embeddings, LLM integration, and data extraction capabilities.

## Development Commands

### Backend (Django)
- **Run tests**: `docker compose -f test.yml run django python manage.py test`n(uses pytest configuration from pytest.ini)
- **Run server locally**: `docker compose -f local.yml up` (defaults to port 8000)
- **Database migrations**: `docker compose -f local.yml run django python manage.py makemigrations` and `docker compose -f local.yml run django python manage.py migrate`
- **Create superuser**: `docker compose -f local.yml run django python manage.py createsuperuser`
- **Django shell**: `docker compose -f local.yml run django python manage.py shell`
- **Run single test file**: `docker compose -f local.yml run django python test tests.test_specific_file`

### Frontend (React/Vite)
- **Start dev server**: `npm start` or `yarn start` (runs on port 3000)
- **Build for production**: `npm run build`
- **Run unit tests**: `npm run test:unit` (uses Vitest)
- **Run E2E tests**: `npm run test:e2e` (uses Playwright)
- **Run component tests**: `npm run test:ct` (Playwright component testing)
- **Lint**: `npm run lint` (Prettier)
- **Fix styles**: `npm run fix-styles`

### Docker Development
- **Full stack**: `docker-compose -f local.yml up --profile fullstack`
- **Backend only**: `docker-compose -f local.yml up` (excludes frontend)
- **With Gremlin analyzer**: `docker-compose -f local_deploy_with_gremlin.yml up`
- **Production**: `docker-compose -f production.yml up`

## Architecture Overview

### High-Level Structure
- **Backend**: Django application with GraphQL API (using Graphene-Django)
- **Frontend**: React SPA using Vite, Apollo Client for GraphQL, Jotai for state management. Styled-components primarily for styling with react-semantic-ui (though we are trying to move away from that).
- **Database**: PostgreSQL with pgvector extension for embeddings
- **Background Tasks**: Celery with Redis broker
- **WebSockets**: Django Channels for real-time features

### Key Django Apps
- `documents/` - Document model and file handling
- `annotations/` - PDF/text annotations with vector embeddings
- `corpuses/` - Document collections and corpus management
- `extracts/` - Data extraction and analysis results
- `analyzer/` - Pluggable document analysis framework
- `llms/` - LLM framework with multi-agent support (LlamaIndex, PydanticAI)
- `conversations/` - Chat conversation management
- `users/` - User management and permissions

### Frontend Architecture
- **State Management**: Jotai atoms for global state, especially PDF annotation state
- **PDF Rendering**: Custom PDF.js integration with annotation overlay system
- **Document Viewer**: `DocumentKnowledgeBase` component handles PDF/text display with annotations
- **GraphQL**: Apollo Client with custom cache policies for pagination and real-time updates

### Document Processing Pipeline
```
Document Upload → Parser (Docling/NLM-Ingest) → Embedder → Vector Store → Analysis Ready
```

Components are pluggable via base classes in `pipeline/base/`:
- `BaseParser` - Extract text/structure from documents
- `BaseEmbedder` - Generate vector embeddings
- `BaseThumnailer` - Create document previews

## Key Technical Concepts

### PDF Annotation System
The PDF annotation system uses a sophisticated virtualized rendering approach:
- Only visible pages are rendered for performance
- Annotations are overlaid using coordinate mapping from PAWLS format
- State managed via Jotai atoms (`AnnotationAtoms.tsx`)
- Supports filtering, selection, and real-time updates

### LLM Framework
OpenContracts includes a unified LLM framework (`llms/`) supporting multiple backends with these core principles:
- **Simplicity**: Beautiful, intuitive APIs that make complex operations feel natural
- **Framework Agnostic**: Support multiple LLM frameworks (LlamaIndex, PydanticAI) through unified interfaces
- **Rich Responses**: Every interaction returns structured data with sources, metadata, and conversation tracking
- **Document Agents**: Chat with individual documents (always within corpus context)
- **Corpus Agents**: Query across document collections
- **Conversation Management**: Persistent conversations with automatic message storage and retrieval
- **Tool System**: Extensible tool system for document analysis and data retrieval
- **Event Streaming**: Real-time agent execution visibility (especially with PydanticAI)
- **Type Safety**: Full type hints and structured responses throughout

### Vector Search
Built on Django + pgvector:
- Automatic embedding generation for documents and annotations
- Hybrid search combining vector similarity and metadata filters
- Custom vector stores for LlamaIndex and PydanticAI integration

## Important Files and Patterns

### Settings Configuration
- `config/settings/base.py` - Core Django settings
- `config/settings/local.py` - Development overrides
- `config/settings/production.py` - Production configuration
- Environment variables via django-environ

### GraphQL Schema
- `config/graphql/schema.py` - Main schema definition
- `config/graphql/mutations.py` - All GraphQL mutations
- `config/graphql/queries.py` - All GraphQL queries
- Generate schema: `python manage.py graphql_schema --schema config.graphql.schema.schema --out schema.graphql`

### Frontend State Management
- Jotai atoms in `frontend/src/components/annotator/context/`
- PDF state: `AnnotationAtoms.tsx`, `DocumentAtom.tsx`
- UI settings: `UISettingsAtoms.tsx`
- Analysis state: `AnalysisAtoms.tsx`

### Testing Patterns
- **Backend**: Pytest with Django test database, factories in `tests/factories.py`
- **Frontend**: Vitest for unit tests, Playwright for E2E and component tests
- **PDF Component Testing**: Use `DocumentKnowledgeBaseTestWrapper` for complex PDF annotation tests
- **VCR Cassettes**: Record HTTP interactions in `fixtures/vcr_cassettes/`

## Development Guidelines

### PDF Annotation Development
When working on PDF annotation features:
- Understand the virtualized rendering system (only visible pages rendered)
- Use existing Jotai atoms for state management
- Follow patterns in `useVisibleAnnotations` for filtering logic
- Test with `DocumentKnowledgeBaseTestWrapper` for integration tests

### GraphQL Development
- Add new queries/mutations to respective files in `config/graphql/`
- Use permission annotations from `config/graphql/permissioning/`
- Update frontend GraphQL types: `npm run codegen` (if configured)
- Test with Apollo Client mocks following patterns in component tests

### Database Migrations
- Always review migration files before applying
- Use `python manage.py sqlmigrate <app> <migration>` to preview SQL
- Consider data migrations for complex schema changes
- Test migrations on production-like data volumes

### Celery Tasks
- Define tasks in `opencontractserver/tasks/`
- Use `@shared_task` decorator for reusability
- Handle failures gracefully with retries
- Monitor with Flower UI (port 5555 in development)

### LLM Integration
OpenContracts provides several high-level API entry points:

#### Basic Agent Usage
```python
from opencontractserver.llms import agents
from opencontractserver.llms.types import AgentFramework

# Document agent (corpus parameter required)
agent = await agents.for_document(document=123, corpus=1)
response = await agent.chat("What are the key terms in this contract?")

# Corpus agent with specific framework
agent = await agents.for_corpus(
    corpus=456,
    framework=AgentFramework.PYDANTIC_AI
)

# With custom configuration
agent = await agents.for_document(
    document=123, corpus=1,
    user_id=789,
    system_prompt="You are a legal contract analyzer...",
    model="gpt-4",
    temperature=0.1,
    tools=["load_md_summary", "get_notes_for_document_corpus"]
)
```

#### Framework Selection
- **LlamaIndex**: *Framework adapter removed* - implement custom adapter following CoreAgent protocol
- **PydanticAI**: Rich observability, event-based streaming, full execution graph visibility (recommended)

#### Event-Based Streaming (PydanticAI)
```python
async for event in agent.stream("Analyze liability clauses"):
    match event.type:
        case "thought":
            print(f"🤔 Agent thinking: {event.thought}")
        case "content":
            print(event.content, end="", flush=True)
        case "sources":
            print(f"📚 Found {len(event.sources)} relevant sources")
        case "final":
            print(f"✅ Complete! Usage: {event.metadata.get('usage', {})}")
```

#### Tools and Vector Stores
- Use high-level APIs: `agents`, `embeddings`, `vector_stores`, `tools`
- Create custom tools using `CoreTool.from_function()`
- Built-in tools: `load_md_summary`, `get_notes_for_document_corpus`, etc.
- Vector stores support advanced filtering with Django ORM syntax

## Pipeline Component Development

### Adding New Document Parsers
1. Inherit from `BaseParser` in `pipeline/base/parser.py`
2. Implement required methods: `parse_document()`, `is_supported_type()`
3. Register in settings or component registry
4. Add tests following existing parser test patterns

### Adding New Embedders
1. Inherit from `BaseEmbedder` in `pipeline/base/embedder.py`
2. Implement `embed_text()` and `embed_documents()` methods
3. Consider both sync and async versions for flexibility
4. Integrate with vector store system

## Performance Considerations

### Database Optimization
- Use `select_related()` and `prefetch_related()` for complex queries
- Consider database indexes for frequent query patterns
- Monitor query performance with Django Debug Toolbar (local) or Silk (production)
- Vector stores use prefetch_related to avoid N+1 queries
- Message storage uses bulk operations where possible

### Frontend Performance
- PDF rendering is virtualized - only visible pages rendered
- Use React.memo() for expensive annotation components
- Jotai atoms provide granular re-rendering
- Consider pagination for large annotation lists

### Celery Task Optimization
- Use bulk operations for database writes
- Implement task progress tracking for long-running jobs
- Consider task routing for CPU vs I/O bound work

### LLM Framework Performance
- **Async Throughout**: All core operations are async-compatible
- **Streaming Responses**: Large responses are streamed to avoid memory issues
- **Embedding Caching**: Vector embeddings can be cached to avoid recomputation
- **Context Windows**: Conversation context is managed within model limits
- **Source Management**: Consistent serialization format eliminates conversion overhead

## Common Issues and Solutions

### PDF Rendering Issues
- Ensure PDF.js worker is properly configured (`pdfjs-worker.d.ts`)
- Check annotation coordinate mapping if selections seem off
- Verify PAWLS format compliance for custom parsers

### GraphQL Errors
- Check permissions in `config/graphql/permissioning/`
- Verify authentication middleware setup
- Use GraphiQL interface for query debugging (available in DEBUG mode)

### Vector Search Issues
- Verify pgvector extension is installed
- Check embedding dimensions match between embedder and storage
- Monitor vector store query performance

### WebSocket Connection Issues
- Check Django Channels configuration in `config/websocket/`
- Verify Redis connection for channel layers
- Test authentication middleware for WebSocket connections

### LLM Framework Issues
- **Agent Creation**: Document agents require both document and corpus parameters
- **Framework Selection**: Use `AgentFramework.PYDANTIC_AI` for event-based streaming
- **Tool Integration**: Ensure tools are appropriate for context (document vs corpus)
- **Conversation Management**: Anonymous conversations (no user_id) cannot be restored
- **Vector Search**: Check embedding dimensions match between embedder and storage
- **Error Handling**: Use structured error types (`AgentError`, `Document.DoesNotExist`)

### LLM Framework Architecture
The framework follows a layered architecture:
```
API Layer (agents, embeddings, vector_stores, tools)
    ↓
Framework Adapter Layer (pydantic_ai_agents.py)
    ↓
Core Agent Protocol & Unified Tool System
    ↓
Core Business Logic & Conversation Management
    ↓
Django Models & Vector Stores
```

Key components:
- `api.py`: High-level entry points like `agents.for_document()`
- `agents/agent_factory.py`: Orchestrates agent creation and framework routing
- `agents/core_agents.py`: Defines `CoreAgent` protocol with `.chat()` and `.stream()` methods
- `conversations/`: `CoreConversationManager` handles message persistence
- `tools/`: `CoreTool` provides framework-agnostic tool definitions
- `vector_stores/`: Framework-specific adapters around `CoreAnnotationVectorStore`
