"""
OpenContracts LLM Agents Package

This package provides framework-agnostic agent interfaces and framework-specific implementations.
"""

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
]
