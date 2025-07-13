# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Backend (Django)
- **Start development server**: `docker-compose -f local.yml up` (full stack with microservices)
- **Backend only**: `docker-compose -f local.yml up django postgres redis`
- **Run tests**: `pytest` (uses settings in pytest.ini with `--ds=config.settings.test --reuse-db --durations=0`)
- **Run single test**: `pytest opencontractserver/tests/test_specific_file.py::test_function`
- **Django management**: `python manage.py <command>` (uses `config.settings.local` by default)
- **Generate test fixtures**: `python manage.py generate_test_fixtures`
- **Make migrations**: `python manage.py makemigrations`
- **Apply migrations**: `python manage.py migrate`

### Frontend (React/TypeScript with Vite)
- **Development server**: `cd frontend && npm start` (or `yarn start`)
- **Build**: `cd frontend && npm run build`
- **Unit tests**: `cd frontend && npm run test:unit` (Vitest)
- **E2E tests**: `cd frontend && npm run test:e2e` (Playwright)
- **Component tests**: `cd frontend && npm run test:ct` (Playwright Component Testing)
- **Lint**: `cd frontend && npm run lint` (Prettier)
- **Fix formatting**: `cd frontend && npm run fix-styles`

### Full Stack Development
- **With frontend**: `docker-compose -f local.yml --profile fullstack up`
- **GraphQL schema generation**: Follow docs in `docs/development/generating-new-graphql-schema.md`

## Architecture Overview

OpenContracts is a Django-based document analytics platform with a React frontend. The system processes legal documents (PDFs, text) using a pluggable pipeline architecture.

### Core Components

**Backend (Django):**
- `opencontractserver/` - Main Django application
- `config/` - Django settings and GraphQL schema
- Modular apps: `documents/`, `annotations/`, `corpuses/`, `extracts/`, `analyzer/`, `users/`
- `pipeline/` - Document processing pipeline (parsers, embedders, thumbnailers)
- `llms/` - LLM integrations (agents, vector stores, tools)
- `tasks/` - Celery background tasks

**Frontend (React/TypeScript):**
- Located in `frontend/` directory
- Uses Vite build system, Apollo GraphQL client, Jotai state management
- PDF viewer with annotation capabilities using PDF.js
- Semantic UI React components

**Key Services:**
- PostgreSQL with pgvector for embeddings
- Redis for caching and Celery
- Celery for background processing
- External microservices: nlm-ingestor, docling-parser, vector-embedder

### Document Processing Pipeline

The system uses a pluggable pipeline architecture in `opencontractserver/pipeline/`:

- **Parsers** (`pipeline/parsers/`) - Extract text/structure from documents
- **Embedders** (`pipeline/embedders/`) - Generate vector embeddings
- **Thumbnailers** (`pipeline/thumbnailers/`) - Create document previews
- **Post-processors** (`pipeline/post_processors/`) - Transform processed documents

Each component inherits from base classes in `pipeline/base/` and implements a standardized interface.

### GraphQL API

- Schema defined in `config/graphql/`
- Uses Graphene-Django
- Supports real-time updates via WebSockets
- Custom permissioning system with django-guardian

### Vector Database Integration

- Django models with pgvector embeddings
- Custom vector stores in `llms/vector_stores/`
- LlamaIndex integration for semantic search
- Supports multiple embedding models

### Testing Architecture

- Backend: pytest with Django test database
- Frontend: Vitest for unit tests, Playwright for E2E/component tests
- Special testing considerations for `DocumentKnowledgeBase` component (see `.cursor/rules/test-document-knowledge-base.mdc`)

## Key Data Models

- **Document** - Core document with parsing results, embeddings
- **Annotation** - Text selections with labels, hierarchical structure
- **Corpus** - Document collections with shared labelsets
- **Extract** - Structured data extraction results
- **Analysis** - Document analysis results from external analyzers

## Development Notes

### Environment Setup
- Uses Docker Compose for local development
- Environment variables in `.envs/.local/` directory
- Frontend environment in `.envs/.local/.frontend`

### Code Style
- Backend: Django conventions, Black formatting
- Frontend: TypeScript, Prettier formatting
- Pre-commit hooks with Husky

### Authentication
- Supports Django auth and Auth0
- GraphQL JWT tokens
- WebSocket authentication middleware

### Microservices Integration
- Document parsing via external REST APIs
- Analyzer integration with callback URLs
- Embeddings generation via microservice

### Testing PDF Components
When testing components that interact with PDF.js (especially `DocumentKnowledgeBase`):
- Always use `DocumentKnowledgeBaseTestWrapper` for component tests
- Mock GraphQL queries completely (including refetches)
- Mock REST endpoints for PDF files and parsing results
- Use longer timeouts for PDF rendering (20s+)
- Test assets in `frontend/test-assets/`

### Performance Considerations
- Large file uploads supported (5GB limit)
- Vector similarity search with pgvector
- Celery background processing for document analysis
- Redis caching for performance

## Documentation
- Full documentation in `docs/` using MkDocs
- Architecture diagrams in `docs/assets/images/diagrams/`
- API documentation via GraphQL introspection
