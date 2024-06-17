# Making a Django Application Compatible with LlamaIndex using a Custom Vector Store

## Introduction

In this walkthrough, we'll explore how the custom `DjangoAnnotationVectorStore` makes a Django application compatible with LlamaIndex, enabling powerful vector search capabilities within the application's structured annotation store. By leveraging the `BasePydanticVectorStore` class provided by LlamaIndex and integrating it with Django's ORM and the `pg-vector` extension for PostgreSQL, we can achieve efficient and scalable vector search functionality.

## Understanding the `DjangoAnnotationVectorStore`

The `DjangoAnnotationVectorStore` is a custom implementation of LlamaIndex's `BasePydanticVectorStore` class, tailored specifically for a Django application. It allows the application to store and retrieve granular, visually-locatable annotations (x-y blocks) from PDF pages using vector search.

Let's break down the key components and features of the `DjangoAnnotationVectorStore`:

### 1. Inheritance from `BasePydanticVectorStore`

```python
class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    ...
```

By inheriting from `BasePydanticVectorStore`, the `DjangoAnnotationVectorStore` gains access to the base functionality and interfaces provided by LlamaIndex for vector stores. This ensures compatibility with LlamaIndex's query engines and retrieval methods.

### 2. Integration with Django's ORM

The `DjangoAnnotationVectorStore` leverages Django's Object-Relational Mapping (ORM) to interact with the application's database. It defines methods like `_get_annotation_queryset()` and `_build_filter_query()` to retrieve annotations from the database using Django's queryset API.

```python
def _get_annotation_queryset(self) -> QuerySet:
    queryset = Annotation.objects.all()
    if self.corpus_id is not None:
        queryset = queryset.filter(
            Q(corpus_id=self.corpus_id) | Q(document__corpus=self.corpus_id)
        )
    if self.document_id is not None:
        queryset = queryset.filter(document=self.document_id)
    if self.must_have_text is not None:
        queryset = queryset.filter(raw_text__icontains=self.must_have_text)
    return queryset.distinct()
```

This integration allows seamless retrieval of annotations from the Django application's database, making it compatible with LlamaIndex's querying and retrieval mechanisms.

### 3. Utilization of `pg-vector` for Vector Search

The `DjangoAnnotationVectorStore` utilizes the `pg-vector` extension for PostgreSQL to perform efficient vector search operations. `pg-vector` adds support for vector data types and provides optimized indexing and similarity search capabilities.

```python
queryset = (
    queryset.order_by(
        CosineDistance("embedding", query.query_embedding)
    ).annotate(
        similarity=CosineDistance("embedding", query.query_embedding)
    )
)[: query.similarity_top_k]
```

In the code above, the `CosineDistance` function from `pg-vector` is used to calculate the cosine similarity between the query embedding and the annotation embeddings stored in the database. This allows for fast and accurate retrieval of relevant annotations based on vector similarity.

### 4. Customization and Filtering Options

The `DjangoAnnotationVectorStore` provides various customization and filtering options to fine-tune the vector search process. It allows filtering annotations based on criteria such as `corpus_id`, `document_id`, and `must_have_text`.

```python
def _build_filter_query(self, filters: Optional[MetadataFilters]) -> QuerySet:
    queryset = self._get_annotation_queryset()

    if filters is None:
        return queryset

    for filter_ in filters.filters:
        if filter_.key == "label":
            queryset = queryset.filter(annotation_label__text__iexact=filter_.value)
        else:
            raise ValueError(f"Unsupported filter key: {filter_.key}")

    return queryset
```

This flexibility enables targeted retrieval of annotations based on specific metadata filters, enhancing the search capabilities of the application.

## Benefits of Integrating LlamaIndex with Django

Integrating LlamaIndex with a Django application using the `DjangoAnnotationVectorStore` offers several benefits:

1. **Structured Annotation Storage**: The Django application's annotation store provides a structured and organized way to store and manage granular annotations extracted from PDF pages. Each annotation is associated with metadata such as page number, bounding box coordinates, and labels, allowing for precise retrieval and visualization.
2. **Efficient Vector Search**: By leveraging the `pg-vector` extension for PostgreSQL, the `DjangoAnnotationVectorStore` enables efficient vector search operations within the Django application. This allows for fast and accurate retrieval of relevant annotations based on their vector embeddings, improving the overall performance of the application.
3. **Compatibility with LlamaIndex**: The `DjangoAnnotationVectorStore` is designed to be compatible with LlamaIndex's query engines and retrieval methods. This compatibility allows the Django application to benefit from the powerful natural language processing capabilities provided by LlamaIndex, such as semantic search, question answering, and document summarization.
4. **Customization and Extensibility**: The `DjangoAnnotationVectorStore` provides a flexible and extensible foundation for building custom vector search functionality within a Django application. It can be easily adapted and extended to meet specific application requirements, such as adding new filtering options or incorporating additional metadata fields.

## Conclusion

By implementing the `DjangoAnnotationVectorStore` and integrating it with LlamaIndex, a Django application can achieve powerful vector search capabilities within its structured annotation store. The custom vector store leverages Django's ORM and the `pg-vector` extension for PostgreSQL to enable efficient retrieval of granular annotations based on vector similarity.

This integration opens up new possibilities for building intelligent and interactive applications that can process and analyze large volumes of annotated data. With the combination of Django's robust web framework and LlamaIndex's advanced natural language processing capabilities, developers can create sophisticated applications that deliver enhanced user experiences and insights.

The `DjangoAnnotationVectorStore` serves as a bridge between the Django ecosystem and the powerful tools provided by LlamaIndex, enabling developers to harness the best of both worlds in their applications.
