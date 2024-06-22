# Hybrid RDBMS and Vector Store with Django

In this tutorial, we'll explore how to use Django as a hybrid relational database management system (RDBMS) and vector
store. We'll leverage `python-pgvector` to perform vector-based queries alongside traditional Django ORM queries.
Additionally, we'll demonstrate how to integrate this setup with LlamaIndex through a
custom `DjangoAnnotationVectorStore`.

## Table of Contents

1. [Introduction](#introduction)
2. [Setting Up Django and pgvector](#setting-up-django-and-pgvector)
3. [Defining Models with Embeddings](#defining-models-with-embeddings)
4. [Querying with pgvector and Django ORM](#querying-with-pgvector-and-django-orm)
5. [Integrating with LlamaIndex](#integrating-with-llamaindex)
6. [Conclusion](#conclusion)

## Introduction

### Why Use Django as a Hybrid RDBMS and Vector Store?

Django is a powerful and flexible web framework that excels at managing relational data. However, modern applications
often need to handle complex data types like vector embeddings, which are essential for tasks like semantic search and
machine learning. By combining Django's traditional RDBMS capabilities with a vector store using `python-pgvector`, we
can efficiently store, query, and analyze data with both relational and vector-based operations.

### Benefits

- **Unified Data Management**: Manage structured and unstructured data within a single framework.
- **Scalability**: Use PostgreSQL's robust features for scalable data storage and querying.
- **Flexibility**: Perform advanced vector searches alongside traditional SQL queries.

## Setting Up Django and pgvector

### Setup Django project

This is a basic walkthrough for how to use Django as an RDBMS and vector store. This is all baked into OpenContracts
and **does not need to be setup**. This tutorial is purely for reference (particularly if you want to create your own
hybrid RDBMS / vector store).

We like using [cookiecutter-django](https://github.com/cookiecutter/cookiecutter-django) to scaffold Django projects.
First setup your preferred local Python environment (venv is recommended but whatever floats your boat) and cd into the
directory you want to hold your app.

Then, install cookiecutter:

```python
pip install "cookiecutter>=1.7.0"
```

Then run it against cookiecutter-django:

```python
cookiecutter https://github.com/cookiecutter/cookiecutter-django
```

Here are some suggested settings (note we're not using docker in our toy app here):

![Django Cookiecutter.png](..%2F..%2Fassets%2Fimages%2Fscreenshots%2FDjango%20Cookiecutter.png)

### Install Dependencies

First, ensure you have `pgvector` installed in your project. The python-pgvector instructions are
[here](https://github.com/pgvector/pgvector-python?tab=readme-ov-file#django). We'll do a quick walkthrough for you.

First, install dependencies. If you're using our starting point, pgvector is in requirements.txt:

```commandline
pip install -r requirements/local.txt
```

Otherwise, you need to:

```commandline
pip install pgvector==0.2.5
```

### Create a django app for our vector models

Add a new app to the django project for our vectors. Let's call it vector:

```commandline
python manage.py startapp vector
```

### If you were starting from scratch, you'd need to create a new, _empty_ migration in one of your Django apps.

Assuming you're working off a fresh Django project, you want to create a migration which will turn on the pgvector
extension in your configure postgres database:

```commandline
python manage.py makemigrations vector --name enable_pgvector --empty
```

### Create a model to store text + embeddings plus some structured metadata

In our vector module, let's edit models.py:

```python
# models.py
from django.db import models
from pgvector.django import VectorField

from sentence_transformers import SentenceTransformer

# Load the sentence transformer model
model = SentenceTransformer('all-MiniLM-L6-v2')

class Document(models.Model):
    title = models.CharField(max_length=255, blank=True, null=True)
    content = models.TextField(blank=False, null=False)
    label = models.CharField(max_length=512, blank=True, null=True)
    embedding = VectorField(dimensions=384, null=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Generate embedding for the document content
        self.embedding = model.encode(self.content).tolist()
        super().save(*args, **kwargs)

```

### Configure Your Postgres Database

There are lots of tutorials on setting up Postgres, and the exact steps depend on your environment. Assuming you've
created a Postgres database and have the proper connection credentials, configure it in your Django settings module.
Follow the official Django instructions
[here](https://docs.djangoproject.com/en/5.0/ref/databases/#postgresql-connection-settings).

### Create migrations for model

```bash
python manage.py makemigrations
```

### Now apply migrations

Usual Django migrate command:

```commandline
python manage.py migrate
```


## Querying with pgvector and Django ORM

### Using Vector Embeddings for Queries

With `pgvector`, you can perform vector-based queries using Django's ORM syntax. For example, finding annotations
similar to a given embedding:

```python
from pgvector.django import CosineDistance
from .models import Annotation

# Example embedding to search for similar annotations
query_embedding = [0.1, 0.2, 0.3, ..., 0.384]

# Perform a cosine similarity search
similar_annotations = Annotation.objects.annotate(
    similarity=CosineDistance('embedding', query_embedding)
).order_by('-similarity')[:10]

for annotation in similar_annotations:
    print(annotation.raw_text, annotation.similarity)
```

### Combining with Traditional Queries

You can combine vector-based searches with traditional Django ORM filters:

```python
# Find annotations for a specific document with similar embeddings
document_id = 1
query_embedding = [0.1, 0.2, 0.3, ..., 0.384]

similar_annotations = Annotation.objects.filter(document_id=document_id).annotate(
    similarity=CosineDistance('embedding', query_embedding)
).order_by('-similarity')[:10]

for annotation in similar_annotations:
    print(annotation.raw_text, annotation.similarity)
```

## Integrating with LlamaIndex

### Custom Vector Store Implementation

We'll create a custom vector store `DjangoAnnotationVectorStore` to integrate with LlamaIndex, enabling the use of
LlamaIndex's ecosystem for advanced querying and processing.

```python
# vector_stores.py
from typing import Any, Optional
from django.db.models import Q, QuerySet
from pgvector.django import CosineDistance
from llama_index.core.schema import BaseNode, TextNode
from llama_index.core.vector_stores.types import (
    BasePydanticVectorStore,
    VectorStoreQuery,
    VectorStoreQueryMode,
    VectorStoreQueryResult,
)
from .models import Annotation


class DjangoAnnotationVectorStore(BasePydanticVectorStore):
    def __init__(self, document_id=None, must_have_text=None):
        self.document_id = document_id
        self.must_have_text = must_have_text

    def _get_annotation_queryset(self) -> QuerySet:
        queryset = Annotation.objects.all()
        if self.document_id:
            queryset = queryset.filter(document_id=self.document_id)
        if self.must_have_text:
            queryset = queryset.filter(raw_text__icontains=self.must_have_text)
        return queryset

    def query(self, query: VectorStoreQuery, **kwargs: Any) -> VectorStoreQueryResult:
        queryset = self._get_annotation_queryset()
        if query.mode == VectorStoreQueryMode.HYBRID:
            queryset = queryset.annotate(
                similarity=CosineDistance('embedding', query.query_embedding)
            ).order_by('-similarity')[:query.hybrid_top_k]
        else:
            queryset = queryset.filter(
                raw_text__icontains=query.query_str
            ).annotate(
                similarity=CosineDistance('embedding', query.query_embedding)
            ).order_by('-similarity')[:query.similarity_top_k]

        rows = list(queryset)
        nodes = [TextNode(doc_id=row.id, text=row.raw_text) for row in rows]
        similarities = [row.similarity for row in rows]

        return VectorStoreQueryResult(nodes=nodes, similarities=similarities)


# Usage in LlamaIndex
from llama_index.core import VectorStoreIndex
from .vector_stores import DjangoAnnotationVectorStore

vector_store = DjangoAnnotationVectorStore(document_id=1, must_have_text="important")
index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
```

### Explanation

1. **Initialization**: The `DjangoAnnotationVectorStore` class initializes with optional filters for `document_id`
   and `must_have_text`.
2. **Querying**: The `_get_annotation_queryset` method builds the base queryset based on the provided filters.
   The `query` method performs vector-based queries using cosine similarity and returns results compatible with
   LlamaIndex.
3. **Integration**: By creating a `VectorStoreIndex` with our custom vector store, we integrate it seamlessly into the
   LlamaIndex ecosystem, enabling advanced semantic search and processing capabilities.

## Conclusion

By combining Django's robust ORM capabilities with vector-based querying using `pgvector`, we can build a powerful
hybrid RDBMS and vector store. This setup not only allows traditional relational queries but also supports advanced
semantic searches. Integrating this with LlamaIndex through a custom vector store, like `DjangoAnnotationVectorStore`,
further enhances the ability to perform complex data extraction and analysis tasks.

This tutorial provides a solid foundation for leveraging Django, `pgvector`, and LlamaIndex to build sophisticated data
processing and retrieval systems. With these tools, you can efficiently manage and query both structured and
unstructured data, unlocking new possibilities for your applications.
