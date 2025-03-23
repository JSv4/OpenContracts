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
   - This is the “write” step—saving the vectors to your database.

### Searching Embeddings (via Django ORM)

1. **`search_by_embedding` Mixin**  
   - All QuerySets that inherit from **`VectorSearchViaEmbeddingMixin`** (e.g., `AnnotationQuerySet`, `DocumentQuerySet`, `NoteQuerySet`) automatically gain the method:
     ```python
     search_by_embedding(
         query_vector: list[float],
         embedder_path: str,
         top_k: int = 10,
     ) -> QuerySet
     ```
   - Usage example:
     ```python
     results = Annotation.objects.search_by_embedding(
         query_vector=[...],
         embedder_path="my-embedder",
         top_k=10,
     )
     ```
   - Under the hood:
     - It uses `CosineDistance` from **pgvector**  
     - Filters only embeddings with a matching `embedder_path`  
     - Orders the results by ascending cosine distance (i.e. nearest first)  
     - Returns a truncated QuerySet with at most `top_k` results.

### How This Works in the Vector Store

1. **`generate_embeddings_from_text` for Query Vectors**  
   - When you are using the **`DjangoAnnotationVectorStore`**, you have two primary scenarios for searching:  
     **(a) `query.query_embedding`** is provided by the caller.  
     **(b) `query.query_str`** is provided and needs to be turned into an embedding.  

   - In scenario (b), the store calls `generate_embeddings_from_text(...)` to convert that string into `(embedder_path, vector).`

2. **Delegation to `search_by_embedding`**  
   - Once the vector is obtained (either directly or generated), the vector store *delegates* the actual similarity search to:
     ```python
     Annotation.objects.search_by_embedding(query_vector=vector, embedder_path=embedder_path, top_k=top_k)
     ```
   - This ensures dimensional mapping (to `vector_384`, `vector_768`, etc.) is handled entirely by the Mixin, so we do *not* need to manually annotate or worry about which embedding field is used.

3. **Handling Metadata and Extra Filters**  
   - The vector store also allows additional pre-filtering (by `corpus_id`, `document_id`, `user_id`, label text, etc.) before performing the vector search.  
   - That way, only the relevant subset of records is considered for the similarity ordering.

4. **Returning Results**  
   - The vector store then fetches the top-k results (as Django model instances) and wraps them in a `VectorStoreQueryResult` object. For example, each `Annotation` is turned into a `TextNode` that includes the annotation’s text and selected metadata.

By following these steps, you gain a simple, consistent approach to both *create* embeddings (using `.add_embedding(...)` on the model instance after generating the vector) and *search* for them (using the Mixin’s `.search_by_embedding(...)` or the `DjangoAnnotationVectorStore`’s `.query()` method).
