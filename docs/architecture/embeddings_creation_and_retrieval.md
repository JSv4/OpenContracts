## Overview of Creating and Searching Embeddings

### Creating Embeddings

1. **Generate the Embeddings (Text → Vector)**
   - Use the unified utility function **`generate_embeddings_from_text(text, corpus_id, mimetype)`** from `opencontractserver/utils/embeddings.py`.
   - This function:
     - *Retrieves* any configured Python embedder class for the specified corpus (if `corpus_id` is provided).
     - If no embedder is found or it fails, *falls back* to the microservice approach, where an external endpoint returns the embedding.
     - Returns a tuple `(embedder_path, vector)`, allowing you to know *which embedder* was used and the numeric embedding vector.

2. **Store the Embeddings**
   - Suppose you have a model instance (e.g., `Annotation`, `Document`, `Note`).
   - Once you have `(embedder_path, vector)` from the generation step, you call:
     ```python
     instance.add_embedding(embedder_path="my-embedder", vector=[...])
     ```
   - Internally, this uses:
     - The `VectorSearchViaEmbeddingMixin.add_embedding(...)` method, which contacts the `Embedding` manager to create or update an embedding record associated with this instance.
     - For multiple vectors (e.g., one instance with many embeddings), use:
       ```python
       instance.add_embeddings("my-embedder", [...multiple_vectors...])
       ```
   - This is the "write" step—saving the vectors to your database.

### Searching Embeddings

Our search architecture is designed with two layers: a **core API** that contains our business logic, and **framework adapters** that provide compatibility with different agent frameworks.

#### Core Search API

1. **`CoreAnnotationVectorStore`** - Framework-Agnostic Business Logic
   - Located in `opencontractserver/llms/core_vector_stores.py`
   - Contains all the business logic for vector search without dependencies on specific agent frameworks
   - Key components:
     ```python
     from opencontractserver.llms.core_vector_stores import (
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
     
     # Execute search
     results = store.search(query)
     
     # Access results
     for result in results:
         annotation = result.annotation
         similarity = result.similarity_score
     ```

2. **Framework-Agnostic Data Structures**
   - `VectorSearchQuery`: Contains query text/embedding, filters, and search parameters
   - `VectorSearchResult`: Contains the annotation and similarity score
   - These structures can be easily converted to/from any framework's format

#### Framework Adapters

Framework adapters are thin wrappers that translate between the core API and specific agent frameworks:

1. **LlamaIndex Adapter** - `DjangoAnnotationVectorStore`
   - Located in `opencontractserver/llms/vector_stores.py`
   - Implements LlamaIndex's `BasePydanticVectorStore` interface
   - Converts between LlamaIndex types and our core types:
     ```python
     # LlamaIndex usage
     from opencontractserver.llms.vector_stores import DjangoAnnotationVectorStore
     
     vector_store = DjangoAnnotationVectorStore(
         corpus_id=my_corpus_id,
         user_id=my_user_id,
     )
     
     # Used with LlamaIndex query engines
     query_engine = index.as_query_engine(vector_store=vector_store)
     response = query_engine.query("What is the main topic?")
     ```

2. **Future Framework Adapters**
   - Pydantic AI adapter (planned)
   - LangChain adapter (if needed)
   - Custom framework adapters

### How This Works in Practice

1. **Query Processing**
   - Framework adapter receives a query in framework-specific format
   - Adapter converts to `VectorSearchQuery`
   - Core store processes the query using our business logic

2. **Vector Generation** 
   - If `query.query_text` is provided, core store calls `generate_embeddings_from_text(...)`
   - If `query.query_embedding` is provided, uses it directly

3. **Database Search**
   - Core store builds Django queryset with filters (corpus, document, user, metadata)
   - Uses `.search_by_embedding(...)` from `VectorSearchViaEmbeddingMixin` for similarity search
   - Returns `VectorSearchResult` objects with annotations and similarity scores

4. **Result Conversion**
   - Framework adapter converts `VectorSearchResult` objects to framework-specific format
   - For LlamaIndex: Creates `TextNode` objects with annotation data and metadata

This architecture provides:
- **Reusability**: Core logic works with any framework
- **Maintainability**: Business logic changes in one place
- **Extensibility**: Easy to add new framework adapters
- **Type Safety**: Clear interfaces between layers
- **Testing**: Core functionality can be tested independently

By following this pattern, you can use the same underlying search capabilities across different agent frameworks while maintaining consistency and avoiding code duplication.
