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
    def add(self, item: Any) -> None:
        """Append *item* – event or ready dict – to the timeline with smart inference.

        Supports:
        • UnifiedStreamEvent instances (Thought/Source/Final)
        • Pre-constructed timeline dicts (already schema-compliant)
        """

        # If the caller passed a dict that already conforms to the schema –
        # simply extend the list.
        if isinstance(item, dict):
            self._timeline.append(item)
            return

        # ------------------------------------------------------------------
        # UnifiedStreamEvent handling
        # ------------------------------------------------------------------
        if isinstance(item, ThoughtEvent):
            meta = item.metadata or {}
            tool_name = meta.get("tool_name")

            # Detect tool-related thoughts for richer icons in the UI.
            if tool_name:
                # 1️⃣  Tool call – "Calling tool `name` ..."
                if item.thought.lower().startswith("calling tool"):
                    self._timeline.append(
                        {
                            "type": "tool_call",
                            "tool": tool_name,
                            "args": meta.get("args"),
                        }
                    )
                    return

                # 2️⃣  Tool result – "Tool `name` returned ..."
                if item.thought.lower().startswith("tool ") and "returned" in item.thought.lower():
                    self._timeline.append({"type": "tool_result", "tool": tool_name})
                    return

            # Fallback: regular thought entry
            if item.thought:
                self._timeline.append({"type": "thought", "text": item.thought})
            return

        if isinstance(item, SourceEvent):
            self._timeline.append({"type": "sources", "count": len(item.sources)})
            return

        if isinstance(item, FinalEvent):
            # Logical finish marker
            self._timeline.append({"type": "status", "msg": "run_finished"})
            return

        # ContentEvent and others are ignored to keep timeline concise.

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
