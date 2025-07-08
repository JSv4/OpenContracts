## Overview of Creating and Searching Embeddings

### Creating Embeddings

1. **Generate the Embeddings (Text → Vector)**
   - Use the unified utility function **`generate_embeddings_from_text(text, embedder_path=None)`** or **`agenerate_embeddings_from_text(text, embedder_path=None)`** from `opencontractserver/utils/embeddings.py`.
   - These functions:
     - *Retrieve* any configured Python embedder class for the specified corpus (if `corpus_id` is provided to `get_embedder()`).
     - If no embedder is found or it fails, *fall back* to the configured default embedder (typically our built-in microservice).
     - Return a tuple `(embedder_path, vector)`, allowing you to know *which embedder* was used and the numeric embedding vector.

2. **Store the Embeddings**
   - Suppose you have a model instance (e.g., `Annotation`, `Document`, `Note`) that uses the `HasEmbeddingMixin`.
   - Once you have `(embedder_path, vector)` from the generation step, you call:
     ```python
     instance.add_embedding(embedder_path="my-embedder", vector=[...])
     ```
   - Internally, this uses:
     - The `HasEmbeddingMixin.add_embedding(...)` method, which contacts the `Embedding` manager to create or update an embedding record associated with this instance.
     - For multiple vectors (e.g., one instance with many embeddings), use:
       ```python
       instance.add_embeddings("my-embedder", [...multiple_vectors...])
       ```
   - This is the "write" step—saving the vectors to your database.

3. **Retrieve Stored Embeddings**
   - To retrieve a stored embedding vector:
     ```python
     # Synchronous retrieval
     vector = instance.get_embedding(
         embedder_path="openai/text-embedding-ada-002",
         dimension=384
     )

     # Asynchronous retrieval (uses database_sync_to_async)
     vector = await instance.aget_embedding(
         embedder_path="openai/text-embedding-ada-002",
         dimension=384
     )
     ```
   - Returns `List[float] | None` - the embedding vector or None if not found.

### Embedding Storage Architecture

The embedding system uses a dedicated `Embedding` model that supports multiple vector dimensions:

- **Supported Dimensions**: 384, 768, 1536, 3072
- **Vector Fields**: `vector_384`, `vector_768`, `vector_1536`, `vector_3072` (other dimensions could easily be added)
- **Reference Fields**: `document_id`, `annotation_id`, `note_id` (depending on the model type)
- **Embedder Tracking**: `embedder_path` field stores the identifier of the embedding model used

### Searching Embeddings

Our search architecture is designed with two layers: a **core API** that contains our business logic, and **framework adapters** that provide compatibility with different agent frameworks.

#### Core Search API

1. **`CoreAnnotationVectorStore`** - Framework-Agnostic Business Logic
   - Located in `opencontractserver/llms/vector_stores/core_vector_stores.py`
   - Contains all the business logic for vector search without dependencies on specific agent frameworks
   - Key components:
     ```python
     from opencontractserver.llms.vector_stores.core_vector_stores import (
         CoreAnnotationVectorStore,
         VectorSearchQuery,
         VectorSearchResult,
     )

     # Initialize the core store
     store = CoreAnnotationVectorStore(
         corpus_id=my_corpus_id,
         user_id=my_user_id,
         embedder_path="my-embedder",
         embed_dim=384,
     )

     # Create a search query
     query = VectorSearchQuery(
         query_text="What is the main topic?",
         similarity_top_k=10,
         filters={"label": "important"}
     )

     # Execute search (sync or async)
     results = store.search(query)
     # OR
     results = await store.async_search(query)

     # Access results
     for result in results:
         annotation = result.annotation
         similarity = result.similarity_score
     ```

2. **Framework-Agnostic Data Structures**
   - `VectorSearchQuery`: Contains query text/embedding, filters, and search parameters
     - `query_text`: Optional text to convert to embedding
     - `query_embedding`: Optional pre-computed embedding vector
     - `similarity_top_k`: Number of results to return (default: 100)
     - `filters`: Optional metadata filters
   - `VectorSearchResult`: Contains the annotation and similarity score
     - `annotation`: The matched Annotation instance
     - `similarity_score`: Cosine distance similarity score

3. **Filtering Logic**
   - **Corpus Filtering**: Annotations are filtered by corpus membership. Structural annotations (`structural=True`) are always included regardless of corpus, while non-structural annotations must belong to the specified corpus.
   - **Document Filtering**: When `document_id` is provided, only annotations from that document are included.
   - **Visibility Filtering**: Annotations are visible if they are structural, public, or created by the requesting user.
   - **Metadata Filtering**: Additional filters can be applied on annotation labels and other fields.

#### Vector Search Mixin

Models that store embeddings can use the `VectorSearchViaEmbeddingMixin` to enable vector similarity searches WHERE
model also uses `HasEmbeddingMixin`:

```python
from opencontractserver.shared.mixins import VectorSearchViaEmbeddingMixin

class AnnotationQuerySet(QuerySet, VectorSearchViaEmbeddingMixin):
    EMBEDDING_RELATED_NAME = "embeddings"  # or "embedding_set" by default

# Usage
annotations = Annotation.objects.search_by_embedding(
    query_vector=[0.1, 0.2, 0.3, ...],
    embedder_path="openai/text-embedding-ada-002",
    top_k=10
)
```

#### Framework Adapters

Framework adapters are thin wrappers that translate between the core API and specific agent frameworks:

1. **LlamaIndex Adapter** - *Removed*
   - The LlamaIndex vector store adapter has been removed from the codebase
   - To use LlamaIndex, implement your own adapter following the CoreAnnotationVectorStore interface
   - Implements LlamaIndex's `BasePydanticVectorStore` interface
   - Converts between LlamaIndex types and our core types:
     ```python
     # LlamaIndex integration example (adapter removed)
     # To use LlamaIndex with OpenContracts vector stores:
     # 1. Create your own adapter class that inherits from BasePydanticVectorStore
     # 2. Wrap CoreAnnotationVectorStore functionality
     # 3. Convert between LlamaIndex and OpenContracts types
     
     # Example structure (not implemented):
     # class MyLlamaIndexVectorStore(BasePydanticVectorStore):
     #     def __init__(self, core_store: CoreAnnotationVectorStore):
     #         self.core_store = core_store
     ```

2. **Removed Adapter**
   - The LlamaIndex vector store adapter (`LlamaIndexAnnotationVectorStore`) has been removed
   - To use LlamaIndex, create your own adapter following the `BasePydanticVectorStore` interface

3. **PydanticAI Adapter** - `PydanticAIAnnotationVectorStore`
   - Located in `opencontractserver/llms/vector_stores/pydantic_ai_vector_stores.py`
   - Provides async-first API with Pydantic models for type safety
   - Converts between PydanticAI types and our core types:
     ```python
     # PydanticAI usage
     from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
         PydanticAIAnnotationVectorStore
     )

     vector_store = PydanticAIAnnotationVectorStore(
         corpus_id=my_corpus_id,
         user_id=my_user_id,
         embed_dim=384,
     )

     # Async search
     response = await vector_store.search_annotations(
         query_text="What is the main topic?",
         similarity_top_k=10
     )

     # Access results
     for result in response.results:
         annotation_id = result["annotation_id"]
         content = result["content"]
         similarity = result["similarity_score"]
     ```

4. **PydanticAI Tool Creation**
   - Use the convenience function to create vector search tools for PydanticAI agents:
     ```python
     from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
         create_vector_search_tool
     )

     # Create a tool function
     vector_search_tool = await create_vector_search_tool(
         user_id=user_id,
         corpus_id=corpus_id,
         document_id=document_id,  # Optional
     )

     # Use with PydanticAI agent
     from pydantic_ai import Agent

     agent = Agent(
         model=my_model,
         tools=[vector_search_tool],
     )
     ```

5. **PydanticAI Response Format**
   - Returns structured `PydanticAIVectorSearchResponse` with validated data:
     ```python
     response = await vector_store.search_annotations("query text")

     # Response structure
     {
         "results": [
             {
                 "annotation_id": 123,
                 "content": "text content",
                 "document_id": 456,
                 "corpus_id": 789,
                 "similarity_score": 0.95,
                 "annotation_label": "label text",
                 "page": 1,
                 "bounds": {"top": 100, "bottom": 200, "left": 50, "right": 300}
             }
         ],
         "total_results": 1
     }
     ```

### Async/Sync Compatibility

The embedding system supports both synchronous and asynchronous operations:

**Synchronous Methods:**
- `generate_embeddings_from_text()`
- `instance.get_embedding()`
- `instance.add_embedding()`
- `store.search()`

**Asynchronous Methods:**
- `agenerate_embeddings_from_text()`
- `instance.aget_embedding()` (uses `database_sync_to_async`)
- `store.async_search()`

When working in async contexts (such as Django Channels WebSocket consumers), always use the async variants to avoid blocking operations.

### How This Works in Practice

1. **Query Processing**
   - Framework adapter receives a query in framework-specific format
   - Adapter converts to `VectorSearchQuery`
   - Core store processes the query using our business logic

2. **Vector Generation**
   - If `query.query_text` is provided, core store calls `generate_embeddings_from_text(...)` or `agenerate_embeddings_from_text(...)`
   - If `query.query_embedding` is provided, uses it directly

3. **Database Search**
   - Core store builds Django queryset with filters (corpus, document, user, metadata)
   - Applies structural annotation logic (structural annotations bypass corpus filtering)
   - Uses `.search_by_embedding(...)` from `VectorSearchViaEmbeddingMixin` for similarity search
   - Returns `VectorSearchResult` objects with annotations and similarity scores

4. **Result Conversion**
   - Framework adapter converts `VectorSearchResult` objects to framework-specific format
   - For LlamaIndex: Creates `TextNode` objects with annotation data and metadata
   - Embedding vectors are retrieved using `aget_embedding()` for async contexts

### Performance Considerations

1. **Database Indexes**: The `Annotation` model includes composite indexes for optimal query performance:
   ```python
   indexes = [
       django.db.models.Index(fields=["structural", "corpus"]),
       # ... other indexes
   ]
   ```

2. **Embedding Retrieval**: Use `prefetch_related("embeddings")` when fetching multiple annotations to avoid N+1 queries.

3. **Vector Dimensions**: Choose appropriate embedding dimensions based on your use case:
   - 384: Fast, good for general similarity
   - 768: Balanced performance and accuracy
   - 1536: High accuracy, more computational cost
   - 3072: Highest accuracy, highest computational cost

### Architecture Benefits

This architecture provides:
- **Reusability**: Core logic works with any framework
- **Maintainability**: Business logic changes in one place
- **Extensibility**: Easy to add new framework adapters
- **Type Safety**: Clear interfaces between layers
- **Testing**: Core functionality can be tested independently
- **Async Support**: Full compatibility with async Django applications
- **Performance**: Optimized database queries and indexing strategies

By following this pattern, you can use the same underlying search capabilities across different agent frameworks while maintaining consistency and avoiding code duplication.
