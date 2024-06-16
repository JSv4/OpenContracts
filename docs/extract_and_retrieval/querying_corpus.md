# Answering Queries using LlamaIndex in a Django Application

This markdown document explains how queries are answered in a Django application using LlamaIndex, the limitations of the approach, and how LlamaIndex is leveraged for this purpose.

## Query Answering Process

1. A user submits a query through the Django application, which is associated with a specific corpus (a collection of documents).
2. The query is saved in the database as a `CorpusQuery` object, and a Celery task (`run_query`) is triggered to process the query asynchronously.
3. Inside the `run_query` task:
   - The `CorpusQuery` object is retrieved from the database using the provided `query_id`.
   - The query's `started` timestamp is set to the current time.
   - The necessary components for query processing are set up, including the embedding model (`HuggingFaceEmbedding`), language model (`OpenAI`), and vector store (`DjangoAnnotationVectorStore`).
   - The `DjangoAnnotationVectorStore` is initialized with the `corpus_id` associated with the query, allowing it to retrieve the relevant annotations for the specified corpus.
   - A `VectorStoreIndex` is created from the `DjangoAnnotationVectorStore`, which serves as the index for the query engine.
   - A `CitationQueryEngine` is instantiated with the index, specifying the number of top similar results to retrieve (`similarity_top_k`) and the granularity of the citation sources (`citation_chunk_size`).
   - The query is passed to the `CitationQueryEngine`, which processes the query and generates a response.
   - The response includes the answer to the query along with the source annotations used to generate the answer.
   - The source annotations are parsed and converted into a markdown format, with each citation linked to the corresponding annotation ID.
   - The query's `sources` field is updated with the annotation IDs used in the response.
   - The query's `response` field is set to the generated markdown text.
   - The query's `completed` timestamp is set to the current time.
   - If an exception occurs during the query processing, the query's `failed` timestamp is set, and the stack trace is stored in the `stacktrace` field.

## Leveraging LlamaIndex

LlamaIndex is leveraged in the following ways to enable query answering in the Django application:

1. **Vector Store**: LlamaIndex provides the `BasePydanticVectorStore` class, which serves as the foundation for the custom `DjangoAnnotationVectorStore`. The `DjangoAnnotationVectorStore` integrates with Django's ORM to store and retrieve annotations efficiently, allowing seamless integration with the existing Django application.
2. **Indexing**: LlamaIndex's `VectorStoreIndex` is used to create an index from the `DjangoAnnotationVectorStore`. The index facilitates fast and efficient retrieval of relevant annotations based on the query.
3. **Query Engine**: LlamaIndex's `CitationQueryEngine` is employed to process the queries and generate responses. The query engine leverages the index to find the most relevant annotations and uses the language model to generate a coherent answer.
4. **Embedding and Language Models**: LlamaIndex provides abstractions for integrating various embedding and language models. In this implementation, the `HuggingFaceEmbedding` and `OpenAI` models are used, but LlamaIndex allows flexibility in choosing different models based on requirements.

By leveraging LlamaIndex, the Django application benefits from a structured and efficient approach to query answering. LlamaIndex provides the necessary components and abstractions to handle vector storage, indexing, and query processing, allowing the application to focus on integrating these capabilities into its existing architecture.
