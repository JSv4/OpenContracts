"""Shared types and enums for the OpenContracts LLM framework."""

from enum import Enum


class AgentFramework(Enum):
    """Supported agent frameworks."""

    LLAMA_INDEX = "llama_index"
    PYDANTIC_AI = "pydantic_ai"
