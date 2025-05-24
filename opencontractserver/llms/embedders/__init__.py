"""
Embeddings module - provides embedding functionality.
"""

# For backward compatibility, we can import the core embedding function directly
from opencontractserver.utils.embeddings import generate_embeddings_from_text as generate

__all__ = ["generate"]
