"""
OpenContracts LLM Agents Package

This package provides framework-agnostic agent interfaces and framework-specific implementations.
"""

from __future__ import annotations

from typing import Any

from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgent,
    get_default_config,
)
from opencontractserver.llms.agents.agent_factory import (
    UnifiedAgentFactory,
    create_document_agent,
    create_corpus_agent,
)

__all__ = [
    # Core interfaces
    "AgentFramework",
    "AgentConfig", 
    "CoreAgent",
    "get_default_config",
    # Factory
    "UnifiedAgentFactory",
    "create_document_agent",
    "create_corpus_agent",
    # Back-compat helpers (added below)
    "for_document",
    "for_corpus",
]

async def for_document(*args: Any, **kwargs: Any):
    """
    Backward-compatibility shim that returns a document agent.

    A local import is used to avoid a circular dependency with
    `opencontractserver.llms.api`.
    """
    from opencontractserver.llms.api import agents as _agent_api  # pylint: disable=import-outside-toplevel

    return await _agent_api.for_document(*args, **kwargs)

async def for_corpus(*args: Any, **kwargs: Any):
    """
    Backward-compatibility shim that returns a corpus agent.

    See `for_document` for rationale behind the local import.
    """
    from opencontractserver.llms.api import agents as _agent_api  # pylint: disable=import-outside-toplevel

    return await _agent_api.for_corpus(*args, **kwargs)

__all__.extend(["for_document", "for_corpus"])
