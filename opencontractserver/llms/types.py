"""Shared types and enums for the OpenContracts LLM framework."""

from collections.abc import Awaitable
from enum import Enum
from typing import Any, Protocol


class AgentFramework(Enum):
    """Supported agent frameworks."""

    LLAMA_INDEX = "llama_index"
    PYDANTIC_AI = "pydantic_ai"


# ------------------------------------------------------------------
# Side-channel streaming helper
# ------------------------------------------------------------------


class StreamObserver(Protocol):
    """Callable that receives live ``UnifiedStreamEvent`` objects.

    Framework adapters will call this observer *whenever* they emit a
    chunk, allowing the host application (e.g. WebSocket layer) to forward
    nested or cross-agent events in real time.
    """

    async def __call__(self, event: Any) -> Awaitable[None]: ...
