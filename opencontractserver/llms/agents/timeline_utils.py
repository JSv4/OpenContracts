from __future__ import annotations

"""Utility helpers for building a *timeline* from unified stream events.

This module centralises the construction of the timeline that is eventually
persisted in ``ChatMessage.data['timeline']`` *and* streamed back to the
frontend.  By deriving the timeline **solely** from the high-level
``UnifiedStreamEvent`` objects we ensure that every framework (pydantic-ai,
llama_index, …) produces the exact same structure without having to duplicate
book-keeping logic in each adapter implementation.
"""

from typing import Any

from .core_agents import FinalEvent, SourceEvent, ThoughtEvent, UnifiedStreamEvent

__all__ = ["TimelineBuilder"]


class TimelineBuilder:
    """Incrementally build a reasoning timeline from streamed events.

    The resulting list conforms to ``opencontractserver.llms.agents.timeline_schema.
    TIMELINE_ENTRY_SCHEMA``.  Only **concise** information is captured – we avoid
    copying the full assistant answer to keep the payload lightweight.
    """

    def __init__(self) -> None:
        self._timeline: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    def add(self, event: UnifiedStreamEvent) -> None:
        """Inspect *event* and append an appropriate timeline entry (in-place)."""
        if isinstance(event, ThoughtEvent):
            if event.thought:
                self._timeline.append({"type": "thought", "text": event.thought})

        elif isinstance(event, SourceEvent):
            self._timeline.append({"type": "sources", "count": len(event.sources)})

        elif isinstance(event, FinalEvent):
            # Mark logical completion – individual adapters may add richer meta
            self._timeline.append({"type": "status", "msg": "run_finished"})

        # We purposely *ignore* ContentEvent to avoid bloating the timeline with
        # every token / chunk.  Adapters that need fine-grained deltas should
        # emit explicit ThoughtEvents instead (e.g. for tool calls).

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------
    @property
    def timeline(self) -> list[dict[str, Any]]:
        """Return the collected timeline list (read-only)."""
        return self._timeline

    def reset(self) -> None:
        """Clear the internal buffer so the instance can be reused."""
        self._timeline.clear()
