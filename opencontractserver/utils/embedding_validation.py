"""JSON embedding response contract, shared by server and database-free workers.

Single vectors may be flat or wrapped in one singleton row. Batch responses
contain exactly one such vector per input. Callers choose whether invalid items
fail the whole preparation or are returned as explicit per-item failures.
"""

import math
from typing import Any


def embedding_values(body: Any) -> list:
    if not isinstance(body, dict) or not isinstance(body.get("embeddings"), list):
        raise ValueError("Embedding response requires an 'embeddings' array")
    return body["embeddings"]


def embedding_batch(body: Any, count: int) -> list:
    rows = embedding_values(body)
    if len(rows) != count:
        raise ValueError("Embedding batch cardinality does not match inputs")
    return rows


def validate_embedding_vector(vector: Any, dimension: int | None = None) -> None:
    """Validate a normalized, nonempty vector without coercing strings or bools."""
    valid = isinstance(vector, list) and bool(vector)
    if valid and dimension is not None:
        valid = len(vector) == dimension
    try:
        valid = valid and all(
            type(value) in (int, float) and math.isfinite(value) for value in vector
        )
    except OverflowError:
        valid = False
    if not valid:
        size = str(dimension) if dimension is not None else "nonempty"
        raise ValueError(f"Embedding requires {size} finite numeric values")


def normalize_embedding_vector(
    vector: Any, dimension: int | None = None
) -> list[float]:
    if isinstance(vector, list) and len(vector) == 1 and isinstance(vector[0], list):
        vector = vector[0]
    validate_embedding_vector(vector, dimension)
    return vector
