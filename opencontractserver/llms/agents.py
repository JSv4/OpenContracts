from __future__ import annotations

import logging
from typing import Literal

import nest_asyncio

from opencontractserver.llms.agents.agent_factory import AgentFramework
from opencontractserver.llms.agents.agent_factory import (
    create_corpus_agent as unified_create_corpus_agent,
)
from opencontractserver.llms.agents.agent_factory import (
    create_document_agent as unified_create_document_agent,
)
from opencontractserver.llms.agents.llama_index_agents import OpenContractDbAgent

# Apply nest_asyncio to enable nested event loops
# I HATE this, but it's llama_index internals keep changing and causing issues
nest_asyncio.apply()

logger = logging.getLogger(__name__)

MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


# Maintain backward compatibility with existing function signatures
async def create_document_agent(*args, **kwargs):
    """Create a document agent using the unified factory (backward compatibility)."""
    agent = await unified_create_document_agent(
        *args, framework=AgentFramework.LLAMA_INDEX, **kwargs
    )
    return OpenContractDbAgent(agent)


async def create_corpus_agent(*args, **kwargs):
    """Create a corpus agent using the unified factory (backward compatibility)."""
    agent = await unified_create_corpus_agent(
        *args, framework=AgentFramework.LLAMA_INDEX, **kwargs
    )
    return OpenContractDbAgent(agent)


# Re-export the original functions for backward compatibility
async def create_openai_document_agent(*args, **kwargs):
    """Backward compatibility - use create_document_agent instead."""
    return await create_document_agent(*args, **kwargs)
