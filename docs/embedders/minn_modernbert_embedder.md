# Minnesota Case Law ModernBERT Embedder

This document provides information about the Minnesota Case Law ModernBERT embedder, which is based on the `conceptofmind/teraflop-minn-caselaw` model from Hugging Face.

## Overview

The Minnesota Case Law ModernBERT embedder is a sentence transformer model that generates 768-dimensional embeddings for text. It is based on the `conceptofmind/teraflop-minn-caselaw` model, which has been fine-tuned on Minnesota case law data, making it particularly suitable for legal document analysis.

## Features

- 768-dimensional embeddings
- Optimized for legal document analysis
- Support for long documents
- Supports PDF, TXT, DOCX, and HTML file types

## Installation

The Minnesota Case Law ModernBERT embedder requires the `sentence-transformers` library:

```bash
pip install sentence-transformers>=2.2.2
```

## Usage

### Using the Embedder in Code

```python
from opencontractserver.pipeline.embedders.minn_modern_bert_embedder import MinnModernBERTEmbedder

# Create an instance of the embedder
embedder = MinnModernBERTEmbedder()

# Generate embeddings for a text
text = "This is a sample legal text to embed."
embedding = embedder.embed_text(text)

# The embedding is a list of 768 floating-point values
print(f"Embedding dimension: {len(embedding)}")
```

### Docker Setup

We provide a Docker setup to run the Minnesota Case Law ModernBERT embedder as a service:

1. Build and start the service:

```bash
docker-compose -f docker-compose.minn_modernbert.yml up -d
```

2. The model will be downloaded and cached in a Docker volume.

3. The service includes a healthcheck to ensure the model is loaded correctly.

## Configuration

The Minnesota Case Law ModernBERT embedder is configured in `config/settings/base.py`:

```python
# Minnesota Case Law ModernBERT embedder settings
MINN_MODERNBERT_EMBEDDERS = {
    "application/pdf": "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.MinnModernBERTEmbedder768",
    "text/plain": "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.MinnModernBERTEmbedder768",
    "text/html": "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.MinnModernBERTEmbedder768",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "opencontractserver.pipeline.embedders.minn_modern_bert_embedder.MinnModernBERTEmbedder768",
}
```

## Model Details

- **Base Model**: conceptofmind/teraflop-minn-caselaw
- **Output Dimensionality**: 768 dimensions
- **Similarity Function**: Cosine Similarity
- **Training Dataset**: Minnesota case law

## Performance Considerations

- The first time the model is used, it will be downloaded from Hugging Face, which may take some time.
- For faster startup, use the Docker setup which preloads the model.
- Using GPU acceleration is recommended for processing large volumes of text. 