# Making a Django Application Compatible with Multiple Agent Frameworks using Layered Vector Store Architecture

## Introduction

This document explores how we've designed a flexible vector store architecture that makes our Django annotation system compatible with multiple agent frameworks (LlamaIndex, Pydantic AI, etc.) while maintaining a clean separation between business logic and framework-specific adapters.

Our approach uses a **two-layer architecture**:
1. **Core Layer**: Framework-agnostic business logic (`CoreAnnotationVectorStore`)
2. **Adapter Layer**: Thin wrappers for specific frameworks (`DjangoAnnotationVectorStore` for LlamaIndex)

This design enables efficient vector search across granular, visually-locatable annotations (x-y blocks) from PDF pages while supporting multiple agent frameworks through a single, well-tested codebase.

## Architecture Overview

### Core Layer: `CoreAnnotationVectorStore`

The core layer contains all business logic for vector search operations, independent of any specific agent framework:

```python
from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
    VectorSearchQuery,
    VectorSearchResult,
)

# Initialize core store with filtering parameters
core_store = CoreAnnotationVectorStore(
    corpus_id=123,
    user_id=456,
    embedder_path="sentence-transformers/all-MiniLM-L6-v2",
    embed_dim=384,
)

# Create framework-agnostic query
query = VectorSearchQuery(
    query_text="What are the key findings?",
    similarity_top_k=10,
    filters={"label": "conclusion"}
)

# Execute search
results = core_store.search(query)

# Access results
for result in results:
    annotation = result.annotation  # Django Annotation model
    score = result.similarity_score  # Similarity score (0.0-1.0)
```

Key features of the core layer:

1. **Framework Independence**: No dependencies on LlamaIndex, Pydantic AI, or other frameworks
2. **Django Integration**: Direct use of Django ORM and the `VectorSearchViaEmbeddingMixin`
3. **Flexible Filtering**: Support for corpus, document, user, and metadata filters
4. **Embedding Generation**: Automatic text-to-vector conversion using `generate_embeddings_from_text`
5. **pgvector Integration**: Efficient vector similarity search using PostgreSQL's pgvector extension

### Adapter Layer: Framework-Specific Wrappers

Framework adapters are lightweight classes that translate between the core API and specific framework interfaces.

#### LlamaIndex Adapter Example

```python
class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    """LlamaIndex adapter for Django Annotation Vector Store.

    This is a thin wrapper around CoreAnnotationVectorStore that implements
    the LlamaIndex BasePydanticVectorStore interface.
    """

    def __init__(self, corpus_id=None, user_id=None, **kwargs):
        super().__init__(stores_text=True, flat_metadata=False)

        # Initialize our core vector store
        self._core_store = CoreAnnotationVectorStore(
            corpus_id=corpus_id,
            user_id=user_id,
            **kwargs
        )

    def query(self, query: VectorStoreQuery) -> VectorStoreQueryResult:
        """Execute a vector search query using our core store."""
        # Convert LlamaIndex query to our internal format
        search_query = VectorSearchQuery(
            query_text=query.query_str,
            query_embedding=query.query_embedding,
            similarity_top_k=query.similarity_top_k or 100,
            filters=self._convert_metadata_filters(query.filters),
        )

        # Execute search using core store
        results = self._core_store.search(search_query)

        # Convert results to LlamaIndex format
        nodes = self._convert_to_text_nodes(results)
        similarities = [result.similarity_score for result in results]
        ids = [str(result.annotation.id) for result in results]

        return VectorStoreQueryResult(
            nodes=nodes,
            similarities=similarities,
            ids=ids
        )
```

Usage with LlamaIndex:

```python
# Create LlamaIndex-compatible vector store
vector_store = DjangoAnnotationVectorStore(
    corpus_id=123,
    user_id=456,
    embed_dim=384
)

# Use with LlamaIndex query engine
index = VectorStoreIndex.from_vector_store(vector_store)
query_engine = index.as_query_engine()

# Query using LlamaIndex interface
response = query_engine.query("What are the main conclusions?")
```

## Technical Deep Dive

### 1. Vector Search Pipeline

The search process follows this pipeline:

1. **Query Reception**: Framework adapter receives query in framework-specific format
2. **Query Translation**: Adapter converts to `VectorSearchQuery`
3. **Core Processing**:
   - Build base Django queryset with instance filters (corpus, document, user)
   - Apply metadata filters (labels, etc.)
   - Generate embeddings from text if needed using `generate_embeddings_from_text`
   - Execute vector similarity search via `search_by_embedding` mixin
4. **Result Translation**: Adapter converts `VectorSearchResult` back to framework format

### 2. Integration with Django ORM and pgvector

The core store leverages Django's powerful ORM features combined with pgvector:

```python
def search(self, query: VectorSearchQuery) -> list[VectorSearchResult]:
    """Execute vector search using Django ORM and pgvector."""
    # Build filtered queryset
    queryset = self._build_base_queryset()
    queryset = self._apply_metadata_filters(queryset, query.filters)

    # Perform vector search using mixin
    if vector is not None:
        queryset = queryset.search_by_embedding(
            query_vector=vector,
            embedder_path=self.embedder_path,
            top_k=query.similarity_top_k
        )

    # Convert to results
    return [VectorSearchResult(annotation=ann, similarity_score=getattr(ann, 'similarity_score', 1.0))
            for ann in queryset]
```

Under the hood, this uses pgvector's `CosineDistance` for efficient similarity computation:

```python
# From VectorSearchViaEmbeddingMixin.search_by_embedding
queryset = queryset.annotate(
    similarity_score=CosineDistance(vector_field, query_vector)
).order_by('similarity_score')[:top_k]
```

### 3. Embedding Management

The system automatically handles embedding generation and retrieval:

- **Text Queries**: Automatically converted to embeddings using corpus-configured embedders
- **Embedding Queries**: Used directly for similarity search
- **Multi-dimensional Support**: Supports 384, 768, 1536, and 3072 dimensional embeddings
- **Embedder Detection**: Automatic detection of corpus-specific embedder configurations

## Benefits of the Layered Architecture

### 1. **Framework Flexibility**
- Support multiple agent frameworks through simple adapters
- Business logic remains consistent across frameworks
- Easy migration between frameworks

### 2. **Maintainability**
- Single source of truth for search logic
- Framework-specific code is minimal and focused
- Bug fixes and improvements benefit all frameworks

### 3. **Performance**
- Direct Django ORM integration
- Efficient pgvector similarity search
- Optimized queryset construction with proper filtering

### 4. **Extensibility**
- Easy to add new metadata filters
- Simple to support additional frameworks
- Flexible configuration options

### 5. **Testing**
- Core logic can be tested independently
- Framework adapters have minimal, focused tests
- Clear separation of concerns

## Example: Adding a New Framework Adapter

To add support for a new framework, you would:

1. **Create the adapter class**:
```python
class MyFrameworkAnnotationVectorStore(MyFrameworkBaseVectorStore):
    def __init__(self, **kwargs):
        self._core_store = CoreAnnotationVectorStore(**kwargs)

    def search(self, framework_query):
        # Convert framework query to VectorSearchQuery
        core_query = self._convert_query(framework_query)

        # Use core store
        results = self._core_store.search(core_query)

        # Convert results back to framework format
        return self._convert_results(results)
```

2. **Implement conversion methods** between framework types and core types
3. **Test the adapter** with your framework's test suite

The core business logic remains unchanged, ensuring consistency across all supported frameworks.

## Conclusion

This layered architecture provides a robust foundation for vector search capabilities within Django applications while maintaining compatibility with multiple agent frameworks. By separating core business logic from framework-specific adapters, we achieve:

- **Consistency**: Same search behavior across all frameworks
- **Maintainability**: Single codebase for core functionality
- **Flexibility**: Easy addition of new framework support
- **Performance**: Direct integration with Django ORM and pgvector

This design pattern can be applied to other components (agents, tools, etc.) to create a comprehensive, framework-agnostic foundation for AI-powered Django applications.
