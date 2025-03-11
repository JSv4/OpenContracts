# ModernBERT Embedder

This document provides information about the ModernBERT embedder, which is based on the `answerdotai/ModernBERT-base` model from Hugging Face.

## Overview

The ModernBERT embedder is a sentence transformer model that generates 768-dimensional embeddings for text. It is based on the `answerdotai/ModernBERT-base` model, which has a maximum sequence length of 8192 tokens, making it suitable for embedding longer documents.

## Features

- 768-dimensional embeddings
- Support for long documents (up to 8192 tokens)
- Optimized for semantic similarity and search
- Supports PDF, TXT, DOCX, and HTML file types

## Installation

The ModernBERT embedder requires the `sentence-transformers` library:

```bash
pip install sentence-transformers>=2.2.2
```

## Usage

### Using the Embedder in Code

```python
from opencontractserver.pipeline.embedders.modern_bert_embedder import ModernBERTEmbedder

# Create an instance of the embedder
embedder = ModernBERTEmbedder()

# Generate embeddings for a text
text = "This is a sample text to embed."
embedding = embedder.embed_text(text)

# The embedding is a list of 768 floating-point values
print(f"Embedding dimension: {len(embedding)}")
```

### Docker Setup

We provide a Docker setup to run the ModernBERT embedder as a service:

1. Build and start the service:

```bash
docker-compose -f docker-compose.modernbert.yml up -d
```

2. The model will be downloaded and cached in a Docker volume.

3. The service includes a healthcheck to ensure the model is loaded correctly.

## Configuration

The ModernBERT embedder is configured in `config/settings/base.py`:

```python
# Preferred embedders for each MIME type
PREFERRED_EMBEDDERS = {
    "text/html": "opencontractserver.pipeline.embedders.modern_bert_embedder.ModernBERTEmbedder768",
    # ...
}

# Default embedders by filetype and dimension
DEFAULT_EMBEDDERS_BY_FILETYPE_AND_DIMENSION = {
    "application/pdf": {
        768: "opencontractserver.pipeline.embedders.modern_bert_embedder.ModernBERTEmbedder768",
        # ...
    },
    # ...
}
```

## Model Details

- **Base Model**: answerdotai/ModernBERT-base
- **Maximum Sequence Length**: 8192 tokens
- **Output Dimensionality**: 768 dimensions
- **Similarity Function**: Cosine Similarity

## Performance Considerations

- The first time the model is used, it will be downloaded from Hugging Face, which may take some time.
- For faster startup, use the Docker setup which preloads the model.
- The model requires approximately 500MB of disk space.
- Using GPU acceleration is recommended for processing large volumes of text. 