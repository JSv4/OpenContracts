"""Clean PydanticAI implementation following PydanticAI patterns."""

import dataclasses
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any, Callable, Optional, Union
from uuid import uuid4

from pydantic_ai.agent import Agent as PydanticAIAgent
from pydantic_ai.agent import (
    CallToolsNode,
    End,
    ModelRequestNode,
    UserPromptNode,
)
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    SystemPromptPart,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    ToolCallPartDelta,
    ToolReturnPart,
    UserPromptPart,
)

from opencontractserver.conversations.models import Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    ApprovalNeededEvent,
    ApprovalResultEvent,
    ContentEvent,
    CoreAgentBase,
    CoreConversationManager,
    CoreCorpusAgentFactory,
    CoreDocumentAgentFactory,
    CorpusAgentContext,
    DocumentAgentContext,
    ErrorEvent,
    FinalEvent,
    MessageState,
    ResumeEvent,
    SourceEvent,
    SourceNode,
    ThoughtEvent,
    UnifiedStreamEvent,
    get_default_config,
)
from opencontractserver.llms.agents.timeline_stream_mixin import TimelineStreamMixin
from opencontractserver.llms.exceptions import ToolConfirmationRequired
from opencontractserver.llms.tools.core_tools import (
    aadd_annotations_from_exact_strings,
    aadd_document_note,
    aduplicate_annotations_with_label,
    aget_corpus_description,
    aget_document_summary,
    aget_document_summary_diff,
    aget_document_summary_versions,
    aget_md_summary_token_length,
    aget_notes_for_document_corpus,
    aload_document_md_summary,
    aload_document_txt_extract,
    asearch_document_notes,
    aupdate_corpus_description,
    aupdate_document_note,
    aupdate_document_summary,
)
from opencontractserver.llms.tools.pydantic_ai_tools import (
    PydanticAIDependencies,
    PydanticAIToolFactory,
)
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
)
from opencontractserver.utils.embeddings import aget_embedder

from .timeline_schema import TimelineEntry
from .timeline_utils import TimelineBuilder

logger = logging.getLogger(__name__)


def _to_source_node(raw: Any) -> SourceNode:
    """
    Convert an item coming from pydantic-ai (dict or BaseModel) to
    our framework-agnostic SourceNode.
    """
    if isinstance(raw, SourceNode):  # already normalised
        return raw

    if hasattr(raw, "model_dump"):
        raw = raw.model_dump()

    # raw is now a dict coming from PydanticAIVectorSearchResponse
    return SourceNode(
        annotation_id=int(raw.get("annotation_id", 0)),
        content=raw.get("content", ""),
        metadata=raw,
        similarity_score=raw.get("similarity_score", 1.0),
    )


# ---------------------------------------------------------------------------
# Pydantic‐AI base – now inherits TimelineStreamMixin for unified timeline.
# ---------------------------------------------------------------------------


class PydanticAICoreAgent(CoreAgentBase, TimelineStreamMixin):
    """PydanticAI implementation of CoreAgentBase following PydanticAI patterns."""

    def __init__(
        self,
        config: AgentConfig,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(config, conversation_manager)
        self.pydantic_ai_agent = pydantic_ai_agent
        self.agent_deps = agent_deps

    async def _initialise_llm_message(self, user_text: str) -> tuple[int, int]:
        """Ensure messages are persisted exactly once per turn.

        CoreAgentBase.stream() has *already* written the HUMAN row before the
        adapter is entered.  Creating another one here would duplicate the
        message.  We therefore re-use the most recent HUMAN message in the
        active conversation when available and only insert a new row if – for
        some edge-case – the wrapper skipped persistence (e.g. store_messages
        was False or we are running via the low-level ``_chat_raw`` path).
        """

        # Try to reuse the last HUMAN message if it matches the current turn
        user_id: int | None = None
        if self.conversation_manager.conversation:
            history = await self.conversation_manager.get_conversation_messages()
            if history and history[-1].msg_type.upper() == "HUMAN":
                user_id = history[-1].id

        # Fallback: create the HUMAN message ourselves (rare code-paths)
        if user_id is None:
            user_id = await self.store_user_message(user_text)

        llm_id = await self.create_placeholder_message("LLM")
        return user_id, llm_id

    async def _finalise_llm_message(
        self,
        llm_id: int,
        final_content: str,
        sources: list[SourceNode],
        usage: dict[str, Any] | None,
        timeline: list[TimelineEntry],
    ) -> None:
        """Finalize LLM message with content, sources, and metadata."""
        await self.complete_message(
            llm_id,
            final_content,
            sources=sources,
            metadata={"usage": usage, "framework": "pydantic_ai", "timeline": timeline},
        )

    async def _get_message_history(self) -> Optional[list[ModelMessage]]:
        """
        Convert OpenContracts `ChatMessage` history to the Pydantic-AI
        `ModelMessage` format.

        `UserPrompt` does **not** exist in Pydantic-AI's public API, so we map
        both human and LLM messages to plain `ModelMessage` instances instead.
        """
        raw_messages = await self.conversation_manager.get_conversation_messages()
        if not raw_messages:
            return None

        history: list[ModelMessage] = []
        for msg in raw_messages:
            msg_type_upper = msg.msg_type.upper()
            content = msg.content

            # Skip any messages with no actual content
            if not content.strip():
                continue

            if msg_type_upper == "HUMAN":
                history.append(ModelRequest(parts=[UserPromptPart(content=content)]))
            elif msg_type_upper == "LLM":
                history.append(ModelResponse(parts=[TextPart(content=content)]))
            elif msg_type_upper == "SYSTEM":
                # System messages are also part of a "request" to the model
                history.append(ModelRequest(parts=[SystemPromptPart(content=content)]))
            # else: We skip unknown types or those not directly mappable here

        return history or None

    async def _chat_raw(
        self, message: str, **kwargs
    ) -> tuple[str, list[SourceNode], dict]:
        """Low-level chat; returns content, sources, metadata (no DB ops)."""
        logger.info(f"[PydanticAI sync chat] Starting chat with message: {message!r}")

        message_history = await self._get_message_history()

        # Prepare parameters for run(); include history only if available
        run_kwargs: dict[str, Any] = {"deps": self.agent_deps}
        if message_history:
            run_kwargs["message_history"] = message_history
        run_kwargs.update(kwargs)

        run_result = await self.pydantic_ai_agent.run(message, **run_kwargs)

        llm_response_content = str(run_result.data)
        sources = [
            self._normalise_source(s) for s in getattr(run_result, "sources", [])
        ]
        usage_data = _usage_to_dict(run_result.usage())

        return (
            llm_response_content,
            sources,
            {"usage": usage_data, "framework": "pydantic_ai"},
        )

    # NOTE: This method was previously called ``stream``.  It is now renamed
    # to ``_stream_core`` so that the TimelineStreamMixin can wrap it and take
    # care of collecting the reasoning timeline.

    async def _stream_core(
        self, message: str, **kwargs
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:
        """Internal streaming generator – TimelineStreamMixin adds timeline."""

        logger.info(f"[PydanticAI stream] Starting stream with message: {message!r}")

        # Extract optional overrides (used by resume_with_approval)
        force_llm_id: int | None = kwargs.pop("force_llm_id", None)
        force_user_msg_id: int | None = kwargs.pop("force_user_msg_id", None)

        user_msg_id: int | None = force_user_msg_id
        llm_msg_id: int | None = force_llm_id

        # ------------------------------------------------------------------
        # Deduplicate message persistence
        # ------------------------------------------------------------------
        if self.conversation_manager.conversation and llm_msg_id is None:
            # Check if CoreAgentBase.stream() already created the placeholder
            history = await self.conversation_manager.get_conversation_messages()
            if (
                history
                and history[-1].msg_type.upper() == "LLM"
                and not history[-1].content
            ):
                llm_msg_id = history[-1].id
                # The corresponding HUMAN message should be right before it
                for prev in reversed(history[:-1]):
                    if prev.msg_type.upper() == "HUMAN":
                        user_msg_id = prev.id
                        break

            # If still none – fall back to helper that creates fresh rows
            if llm_msg_id is None:
                user_msg_id, llm_msg_id = await self._initialise_llm_message(message)

        accumulated_content: str = ""
        accumulated_sources: list[SourceNode] = []
        final_usage_data: dict[str, Any] | None = None

        # Re-hydrate the historical context for Pydantic-AI, if any exists.
        message_history = await self._get_message_history()

        stream_kwargs: dict[str, Any] = {"deps": self.agent_deps}
        if message_history:
            stream_kwargs["message_history"] = message_history
        stream_kwargs.update(kwargs)

        # Timeline builder – captures reasoning steps for persistence/UI
        builder = TimelineBuilder()

        try:
            async with self.pydantic_ai_agent.iter(
                message, **stream_kwargs
            ) as agent_run:
                async for node in agent_run:

                    # ------------------------------------------------------------------
                    # USER PROMPT NODE – This is the very first node in the graph.
                    # ------------------------------------------------------------------
                    if isinstance(node, UserPromptNode):
                        event_obj = ThoughtEvent(
                            thought="Received user prompt; beginning reasoning cycle…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )
                        builder.add(event_obj)
                        yield event_obj

                    # ------------------------------------------------------------------
                    # MODEL REQUEST NODE – We can stream raw model deltas from here.
                    # ------------------------------------------------------------------
                    elif isinstance(node, ModelRequestNode):
                        event_obj = ThoughtEvent(
                            thought="Sending request to language model…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )
                        builder.add(event_obj)
                        yield event_obj

                        try:
                            async with node.stream(agent_run.ctx) as model_stream:
                                async for event in model_stream:
                                    text, is_answer, meta = _event_to_text_and_meta(
                                        event
                                    )
                                    if text:
                                        if is_answer:
                                            accumulated_content += text
                                            # Content timeline now handled by TimelineStreamMixin

                                        # Merge any source nodes attached to event (unlikely here but future-proof)
                                        accumulated_sources.extend(
                                            [
                                                _to_source_node(s)
                                                for s in getattr(event, "sources", [])
                                            ]
                                        )
                                        # builder will record Sources automatically

                                        content_ev = ContentEvent(
                                            content=text,
                                            accumulated_content=accumulated_content,
                                            user_message_id=user_msg_id,
                                            llm_message_id=llm_msg_id,
                                            metadata=meta,
                                        )
                                        builder.add(content_ev)
                                        yield content_ev
                        except Exception:
                            # Already handled by outer error handler – stop processing this node
                            raise

                    # ------------------------------------------------------------------
                    # CALL TOOLS NODE – Capture tool call & result events.
                    # ------------------------------------------------------------------
                    elif isinstance(node, CallToolsNode):
                        event_obj = ThoughtEvent(
                            thought="Processing model response – may invoke tools…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )
                        builder.add(event_obj)
                        yield event_obj

                        try:
                            async with node.stream(agent_run.ctx) as tool_stream:
                                async for event in tool_stream:
                                    if event.event_kind == "function_tool_call":
                                        tool_name = event.part.tool_name
                                        tool_args = event.part.args
                                        tool_call_id = getattr(
                                            event.part, "tool_call_id", str(uuid4())
                                        )

                                        # Check if tool requires approval BEFORE pydantic-ai executes it
                                        if self._check_tool_requires_approval(
                                            tool_name
                                        ):
                                            # Log the exact format of tool_args for debugging
                                            logger.info(
                                                f"Tool '{tool_name}' requires approval. "
                                                f"Args type: {type(tool_args)}, value: {tool_args!r}"
                                            )

                                            # Ensure args are JSON-serializable
                                            if isinstance(tool_args, dict):
                                                serializable_args = tool_args
                                            elif hasattr(tool_args, "model_dump"):
                                                # Pydantic model
                                                serializable_args = (
                                                    tool_args.model_dump()
                                                )
                                            elif hasattr(tool_args, "__dict__"):
                                                # Regular object
                                                serializable_args = tool_args.__dict__
                                            else:
                                                # Fallback - store as string
                                                logger.warning(
                                                    f"Tool args not easily serializable: {type(tool_args)}"
                                                )
                                                serializable_args = str(tool_args)

                                            # Store state to DB
                                            await self.complete_message(
                                                llm_msg_id,
                                                content="Awaiting user approval for tool execution.",
                                                metadata={
                                                    "state": str(
                                                        MessageState.AWAITING_APPROVAL
                                                    ),
                                                    "pending_tool_call": {
                                                        "name": tool_name,
                                                        "arguments": serializable_args,
                                                        "tool_call_id": tool_call_id,
                                                    },
                                                    "framework": "pydantic_ai",
                                                    "timeline": builder.timeline,  # Preserve timeline so far
                                                },
                                            )

                                            # Emit approval event and stop streaming
                                            yield ApprovalNeededEvent(
                                                pending_tool_call={
                                                    "name": tool_name,
                                                    "arguments": tool_args,
                                                    "tool_call_id": tool_call_id,
                                                },
                                                user_message_id=user_msg_id,
                                                llm_message_id=llm_msg_id,
                                                metadata={
                                                    "state": str(
                                                        MessageState.AWAITING_APPROVAL
                                                    )
                                                },
                                            )
                                            return  # Exit the stream

                                        # If no approval needed, emit the tool call event normally
                                        tool_ev = ThoughtEvent(
                                            thought=f"Calling tool `{tool_name}` with args {event.part.args}",
                                            user_message_id=user_msg_id,
                                            llm_message_id=llm_msg_id,
                                            metadata={
                                                "tool_name": tool_name,
                                                "args": event.part.args,
                                            },
                                        )
                                        builder.add(tool_ev)
                                        yield tool_ev

                                    elif event.event_kind == "function_tool_result":
                                        tool_name = event.result.tool_name  # type: ignore[attr-defined]
                                        # Capture vector-search results (our canonical source provider)
                                        if tool_name == "similarity_search":
                                            raw_sources = event.result.content  # type: ignore[attr-defined]
                                            if isinstance(raw_sources, list):
                                                new_sources = [
                                                    _to_source_node(s)
                                                    for s in raw_sources
                                                ]
                                                accumulated_sources.extend(new_sources)
                                                # Emit a dedicated SourceEvent so the client
                                                # can update citations in real-time.
                                                src_ev = SourceEvent(
                                                    sources=new_sources,
                                                    user_message_id=user_msg_id,
                                                    llm_message_id=llm_msg_id,
                                                )
                                                builder.add(src_ev)
                                                yield src_ev

                                        # Special handling for nested document-agent responses
                                        elif tool_name == "ask_document":
                                            # The ask_document tool returns a dict with keys: answer, sources, timeline
                                            try:
                                                result_payload = event.result.content  # type: ignore[attr-defined]
                                                # Ensure we have a dict (pydantic may already return dict object)
                                                if isinstance(result_payload, str):
                                                    import json as _json

                                                    result_payload = _json.loads(
                                                        result_payload
                                                    )

                                                if isinstance(result_payload, dict):
                                                    # 1) Surface child sources immediately so UI can pin them
                                                    child_sources_raw = (
                                                        result_payload.get(
                                                            "sources", []
                                                        )
                                                    )
                                                    if child_sources_raw:
                                                        new_sources = [
                                                            _to_source_node(s)
                                                            for s in child_sources_raw
                                                        ]
                                                        accumulated_sources.extend(
                                                            new_sources
                                                        )
                                                        src_ev = SourceEvent(
                                                            sources=new_sources,
                                                            user_message_id=user_msg_id,
                                                            llm_message_id=llm_msg_id,
                                                        )
                                                        builder.add(src_ev)
                                                        yield src_ev

                                                    # 2) Relay child timeline entries as ThoughtEvents,
                                                    # prefixing with document context for clarity
                                                    child_tl = result_payload.get(
                                                        "timeline", []
                                                    )
                                                    for tl_entry in child_tl:
                                                        tl_text = (
                                                            tl_entry.get("thought")
                                                            or ""
                                                        )
                                                        if not tl_text:
                                                            continue
                                                        prefixed_text = (
                                                            f"[ask_document] {tl_text}"
                                                        )
                                                        tl_ev = ThoughtEvent(
                                                            thought=prefixed_text,
                                                            user_message_id=user_msg_id,
                                                            llm_message_id=llm_msg_id,
                                                            metadata={
                                                                "tool_name": tool_name,
                                                                **(
                                                                    tl_entry.get(
                                                                        "metadata"
                                                                    )
                                                                    or {}
                                                                ),
                                                            },
                                                        )
                                                        builder.add(tl_ev)
                                                        yield tl_ev

                                                    # 3) Append the child answer to accumulated_content
                                                    # so it is included in final answer.
                                                    answer_txt = result_payload.get(
                                                        "answer", ""
                                                    )
                                                    if answer_txt:
                                                        accumulated_content += (
                                                            answer_txt
                                                        )
                                                        content_ev = ContentEvent(
                                                            content=answer_txt,
                                                            accumulated_content=accumulated_content,
                                                            user_message_id=user_msg_id,
                                                            llm_message_id=llm_msg_id,
                                                            metadata={
                                                                "from": "ask_document"
                                                            },
                                                        )
                                                        builder.add(content_ev)
                                                        yield content_ev
                                            except (
                                                Exception
                                            ) as _inner_exc:  # noqa: BLE001 – defensive
                                                logger.warning(
                                                    "Failed to process ask_document result payload: %s",
                                                    _inner_exc,
                                                )

                                            # Always log completion of ask_document regardless of success
                                            tool_ev = ThoughtEvent(
                                                thought=f"Tool `{tool_name}` returned a result.",
                                                user_message_id=user_msg_id,
                                                llm_message_id=llm_msg_id,
                                                metadata={"tool_name": tool_name},
                                            )
                                            builder.add(tool_ev)
                                            yield tool_ev

                                        else:
                                            # Let TimelineBuilder infer tool_result from metadata
                                            tool_ev = ThoughtEvent(
                                                thought=f"Tool `{tool_name}` returned a result.",
                                                user_message_id=user_msg_id,
                                                llm_message_id=llm_msg_id,
                                                metadata={"tool_name": tool_name},
                                            )
                                            builder.add(tool_ev)
                                            yield tool_ev
                        except Exception:
                            # Already handled by outer error handler – stop processing this node
                            break

                    # ------------------------------------------------------------------
                    # END NODE – Execution graph is finished.
                    # ------------------------------------------------------------------
                    elif isinstance(node, End):
                        end_ev = ThoughtEvent(
                            thought="Run finished; aggregating final results…",
                            user_message_id=user_msg_id,
                            llm_message_id=llm_msg_id,
                        )
                        builder.add(end_ev)
                        yield end_ev

                # After exiting the for-loop, the agent_run is complete and contains the final result.
                if agent_run.result:
                    result_content = str(agent_run.result.output)
                    # If we failed to stream tokens (e.g. provider buffered) or the
                    # final result is longer (more complete), prefer it.
                    if not accumulated_content or len(result_content) > len(
                        accumulated_content
                    ):
                        accumulated_content = result_content
                    final_usage_data = _usage_to_dict(agent_run.result.usage())
                    # builder will add run_finished status

            # --------------------------------------------------------------
            # Build and inject the final timeline, then persist via helper
            # --------------------------------------------------------------

            final_event = FinalEvent(
                accumulated_content=accumulated_content,
                sources=accumulated_sources,
                metadata={
                    "usage": final_usage_data,
                    "framework": "pydantic_ai",
                },
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                content=accumulated_content,
            )

            builder.add(final_event)

            # Inject timeline into metadata
            final_event.metadata["timeline"] = builder.timeline

            # Persist – this is idempotent even if CoreAgentBase finalises later
            try:
                await self._finalise_llm_message(
                    llm_msg_id,
                    accumulated_content,
                    accumulated_sources,
                    final_usage_data,
                    builder.timeline,
                )
            except Exception as _err:
                logger.exception(
                    "Failed to persist LLM message with timeline: %s", _err
                )

            # Emit to caller (frontend)
            yield final_event

        except ToolConfirmationRequired as e:
            # Legacy exception handler - kept as fallback
            # Note: Tool approval is now handled proactively in CallToolsNode processing
            # This handler remains for backward compatibility or edge cases where
            # ToolConfirmationRequired might still be raised from tool execution
            logger.warning(
                "[PydanticAI stream] ToolConfirmationRequired caught in outer handler - "
                "this should have been handled earlier. Tool: '%s'",
                e.tool_name,
            )

            await self.complete_message(
                llm_msg_id,
                content="Awaiting user approval for tool execution.",
                metadata={
                    "state": str(MessageState.AWAITING_APPROVAL),
                    "pending_tool_call": {
                        "name": e.tool_name,
                        "arguments": e.tool_args,
                        "tool_call_id": e.tool_call_id,
                    },
                    "framework": "pydantic_ai",
                },
            )

            # Emit explicit approval-needed event (non-final).
            yield ApprovalNeededEvent(
                pending_tool_call={
                    "name": e.tool_name,
                    "arguments": e.tool_args,
                    "tool_call_id": e.tool_call_id,
                },
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={"state": str(MessageState.AWAITING_APPROVAL)},
            )
            return

        except Exception as e:
            # Mark the message as errored in the database
            if llm_msg_id:
                await self.mark_message_error(llm_msg_id, str(e))
            logger.exception(f"Error in PydanticAI stream: {e}")

            # Emit an ErrorEvent so consumers can handle it gracefully
            error_message = str(e)
            if "UsageLimitExceeded" in type(e).__name__:
                error_message = f"Usage limit exceeded: {error_message}"

            yield ErrorEvent(
                error=error_message,
                content=f"Error: {error_message}",
                user_message_id=user_msg_id,
                llm_message_id=llm_msg_id,
                metadata={
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "framework": "pydantic_ai",
                },
            )

    async def resume_with_approval(
        self,
        llm_message_id: int,
        approved: bool,
        **kwargs,
    ) -> AsyncGenerator[UnifiedStreamEvent, None]:
        """Resume a paused run after an approval decision.

        Always yields a *stream* of events so callers can iterate via
        ``async for`` regardless of approval outcome.
        """

        from django.core.exceptions import ObjectDoesNotExist

        from opencontractserver.conversations.models import ChatMessage

        try:
            paused_msg = await ChatMessage.objects.aget(id=llm_message_id)
        except ObjectDoesNotExist:  # pragma: no cover – defensive guard
            raise ValueError(f"ChatMessage {llm_message_id} not found")

        current_state = paused_msg.data.get("state")
        # Handle both enum and string values for state comparison
        awaiting_state = MessageState.AWAITING_APPROVAL
        if hasattr(awaiting_state, "value"):
            awaiting_state = awaiting_state.value

        if current_state != awaiting_state and current_state != str(
            MessageState.AWAITING_APPROVAL
        ):
            logger.warning(
                f"Message {llm_message_id} is not awaiting approval. "
                f"Current state: {current_state}, data: {paused_msg.data}"
            )
            # Check if it was already processed (handle both enum values and strings)
            completed_states = [MessageState.COMPLETED, MessageState.CANCELLED]
            completed_values = [str(s) for s in completed_states]
            if hasattr(MessageState.COMPLETED, "value"):
                completed_values.extend([s.value for s in completed_states])

            if current_state in completed_values:
                logger.info("Message was already processed, likely a duplicate request")
                # Return empty generator to avoid error
                return
            raise ValueError(
                f"Message is not awaiting approval (state: {current_state})"
            )

        pending = paused_msg.data.get("pending_tool_call") or {}
        tool_name = pending.get("name")
        tool_args_raw = pending.get("arguments", {})

        # Log the raw state for debugging
        logger.info(
            f"Resume approval for tool '{tool_name}': "
            f"raw args type={type(tool_args_raw)}, value={tool_args_raw!r}"
        )

        # Normalize tool_args to always be a dict
        if isinstance(tool_args_raw, str):
            # Try to parse as JSON first
            try:
                tool_args = json.loads(tool_args_raw)
                logger.info(f"Parsed JSON args: {tool_args}")
            except json.JSONDecodeError:
                # If not JSON, assume it's a single string argument
                # For update_document_summary, the parameter is 'new_content'
                if tool_name == "update_document_summary":
                    tool_args = {"new_content": tool_args_raw}
                    logger.info(f"String arg for update_document_summary: {tool_args}")
                else:
                    # Generic fallback for other tools
                    logger.warning(
                        f"Tool args is plain string for {tool_name}: {tool_args_raw}"
                    )
                    tool_args = {"arg": tool_args_raw}
        elif isinstance(tool_args_raw, dict):
            tool_args = tool_args_raw
            logger.info(f"Args already dict: {tool_args}")
        else:
            logger.error(f"Unexpected tool_args type: {type(tool_args_raw)}")
            tool_args = {}

        # Emit ApprovalResultEvent immediately so consumers are aware of decision
        yield ApprovalResultEvent(
            decision="approved" if approved else "rejected",
            pending_tool_call=pending,
            user_message_id=paused_msg.id,
            llm_message_id=paused_msg.id,
        )

        # Determine result based on decision
        if approved:
            # Locate tool by name among config.tools if available
            wrapper_fn = None
            for tool in self.config.tools or []:
                if getattr(tool, "__name__", None) == tool_name:
                    wrapper_fn = tool
                    logger.info(f"Found tool '{tool_name}' in config.tools: {tool}")
                    break

            # Helper stub ctx carrying call-id for wrappers that expect it.
            class _EmptyCtx:  # noqa: D401 – simple placeholder
                tool_call_id = pending.get("tool_call_id")
                skip_approval_gate = True

            import inspect

            async def _maybe_await(call_result):  # noqa: D401 – small helper
                return (
                    await call_result
                    if inspect.isawaitable(call_result)
                    else call_result
                )

            # Try to execute the tool
            tool_executed = False

            if wrapper_fn is not None:
                # Found in config.tools - these should be callable functions
                logger.info(
                    f"Executing tool '{tool_name}' from config.tools with args: {tool_args}"
                )
                try:
                    result = await _maybe_await(wrapper_fn(_EmptyCtx(), **tool_args))
                    tool_executed = True
                except TypeError as e:
                    logger.error(f"TypeError calling tool from config: {e}")
                    # Don't retry here, fall through to registry lookup

            if not tool_executed:
                # Resort to pydantic-ai registry – may return Tool object.
                tool_obj = self.pydantic_ai_agent._function_tools.get(tool_name)
                if tool_obj is None:
                    raise ValueError(f"Tool '{tool_name}' not found for execution")

                # Try common attributes to reach the underlying callable.
                candidate = None
                for attr in ("function", "_wrapped_function", "callable_function"):
                    candidate = getattr(tool_obj, attr, None)
                    if callable(candidate):
                        break

                if candidate is None or not callable(candidate):
                    raise TypeError(
                        "Tool object is not callable and no inner function found"
                    )

                logger.info(
                    f"Executing tool '{tool_name}' via registry with args: {tool_args}"
                )

                # Final check to ensure tool_args is a dict
                if not isinstance(tool_args, dict):
                    logger.error(
                        f"tool_args is not a dict at execution time! "
                        f"Type: {type(tool_args)}, Value: {tool_args!r}"
                    )
                    # Try to recover
                    if isinstance(tool_args, str):
                        # For known tools, use the correct parameter name
                        if tool_name == "update_document_summary":
                            tool_args = {"new_content": tool_args}
                        else:
                            tool_args = {"arg": tool_args}
                    else:
                        tool_args = {}

                try:
                    result = await _maybe_await(candidate(_EmptyCtx(), **tool_args))
                except TypeError as e:
                    # Log full details for debugging
                    logger.error(
                        f"TypeError calling tool {tool_name}: {e}\n"
                        f"Args: {tool_args}\n"
                        f"Candidate: {candidate}\n"
                        f"Tool obj: {tool_obj}"
                    )
                    raise

            tool_result = {"result": result}
            status_str = "approved"
        else:
            tool_result = {
                "status": "rejected",
                "reason": "User did not approve execution.",
            }
            status_str = "rejected"

        # Append tool_return part to history only when *approved*; for rejected we
        # simply finish the message lifecycle and emit a final event.
        if approved:
            tool_call_id = pending.get("tool_call_id") or str(uuid4())

            tool_return_part = ToolReturnPart(
                tool_name=tool_name,
                content=json.dumps(tool_result, default=str),
                tool_call_id=tool_call_id,
            )

            history = await self._get_message_history() or []
            history.append(ModelRequest(parts=[tool_return_part]))

        # ------------------------------------------------------------------
        # Mark the original paused message as completed/rejected BEFORE any
        # further model calls so the frontend DB poll sees the new state.
        # ------------------------------------------------------------------

        new_state = MessageState.COMPLETED if approved else MessageState.CANCELLED
        new_state_str = str(new_state)

        try:
            await self.complete_message(
                paused_msg.id,
                paused_msg.content,
                metadata={
                    **paused_msg.data,
                    "state": new_state_str,
                    "approval_decision": status_str,
                    "message_id": str(paused_msg.id),
                },
            )
        except Exception as _e:  # pragma: no cover – non-critical
            logger.warning(
                "Failed to finalise paused message after approval decision: %s",
                _e,
            )

        # If rejected – emit client-facing event(s)
        if not approved:
            rejection_msg = "Tool execution rejected by user."
            yield FinalEvent(
                accumulated_content=rejection_msg,
                sources=[],
                metadata={
                    "approval_decision": status_str,
                    "message_id": str(paused_msg.id),
                },
                user_message_id=paused_msg.id,
                llm_message_id=paused_msg.id,
                content=rejection_msg,
            )
            return

        # If approved – continue via streaming and yield downstream events.
        else:
            # New placeholder LLM message to track resumed run
            resumed_llm_id = await self.create_placeholder_message("LLM")

            # ----------------------------------------------------------
            # Determine the *actual* user message that triggered the pause
            # so that downstream events carry the correct identifier.  We
            # simply pick the most recent HUMAN message in the same
            # conversation.
            # ----------------------------------------------------------
            user_message_id: int | None = None
            from opencontractserver.conversations.models import (  # local import to avoid cycles
                ChatMessage,
            )

            if paused_msg.conversation_id:
                async for _m in ChatMessage.objects.filter(
                    conversation_id=paused_msg.conversation_id,
                    msg_type="HUMAN",
                ).order_by("-created"):
                    user_message_id = _m.id
                    break

            if user_message_id is None:
                user_message_id = paused_msg.id  # Fallback to previous behaviour

            # Emit ResumeEvent so consumers can start a new spinner / pane
            yield ResumeEvent(
                user_message_id=user_message_id,
                llm_message_id=resumed_llm_id,
            )

            # ----------------------------------------------
            # Run normal streaming continuation via _stream_core
            # ----------------------------------------------

            accumulated_content = ""

            # Create a continuation prompt that includes the tool result
            continuation_prompt = (
                f"The tool '{tool_name}' was executed with user approval and returned: "
                f"{json.dumps(tool_result, indent=2)}. "
                f"Please continue with your original task based on this result."
            )

            logger.info(f"Resuming with continuation prompt: {continuation_prompt}")

            async for ev in self._stream_core(
                continuation_prompt,
                force_llm_id=resumed_llm_id,
                force_user_msg_id=user_message_id,
                deps=self.agent_deps,
            ):
                if isinstance(ev, FinalEvent):
                    ev.metadata["approval_decision"] = status_str
                    accumulated_content = ev.accumulated_content or ev.content
                yield ev

            # Ensure DB message contains approval_decision (it may have been
            # missing in _stream_core's finalisation).
            try:
                await self.conversation_manager.update_message(
                    resumed_llm_id,
                    accumulated_content,
                    metadata={"approval_decision": status_str},
                )
            except Exception:  # pragma: no cover
                logger.exception("Failed to patch approval_decision on resumed msg")

            return

    def _check_tool_requires_approval(self, tool_name: str) -> bool:
        """Check if a tool requires approval before execution.

        Args:
            tool_name: Name of the tool to check

        Returns:
            True if the tool requires approval, False otherwise
        """
        # First check tools passed to the agent config
        if self.config.tools:
            for tool in self.config.tools:
                if hasattr(tool, "__name__") and tool.__name__ == tool_name:
                    # Check if it's a wrapped PydanticAI tool
                    if hasattr(tool, "__wrapped__"):
                        # Look for the core_tool attribute in the wrapper
                        wrapper = tool
                        while hasattr(wrapper, "__wrapped__"):
                            if hasattr(wrapper, "core_tool"):
                                return wrapper.core_tool.requires_approval
                            wrapper = wrapper.__wrapped__
                    # Check if the tool itself has a requires_approval attribute
                    if hasattr(tool, "requires_approval"):
                        return tool.requires_approval

        # Check tools registered with pydantic-ai agent
        if hasattr(self.pydantic_ai_agent, "_function_tools"):
            tool_obj = self.pydantic_ai_agent._function_tools.get(tool_name)
            if tool_obj:
                # Check various possible attributes where the CoreTool might be stored
                for attr in ("core_tool", "_core_tool", "wrapped_tool"):
                    core_tool = getattr(tool_obj, attr, None)
                    if core_tool and hasattr(core_tool, "requires_approval"):
                        return core_tool.requires_approval

                # Check if the tool object itself has requires_approval
                if hasattr(tool_obj, "requires_approval"):
                    return tool_obj.requires_approval

                # Check the wrapped function
                for attr in ("function", "_wrapped_function", "callable_function"):
                    func = getattr(tool_obj, attr, None)
                    if func:
                        # Check if the function has a core_tool attribute
                        if hasattr(func, "core_tool") and hasattr(
                            func.core_tool, "requires_approval"
                        ):
                            return func.core_tool.requires_approval
                        # Check if the function itself has requires_approval
                        if hasattr(func, "requires_approval"):
                            return func.requires_approval

        # Default to not requiring approval
        return False

    # Expose for CoreAgentBase wrapper
    _stream_raw = _stream_core


def _prepare_pydantic_ai_model_settings(
    config: AgentConfig,
) -> Optional[dict[str, Any]]:
    """Helper to construct model_settings dict for PydanticAI Agent."""
    model_settings = {}
    if config.temperature is not None:
        model_settings["temperature"] = config.temperature
    if config.max_tokens is not None:
        model_settings["max_tokens"] = config.max_tokens
    return model_settings if model_settings else None


class PydanticAIDocumentAgent(PydanticAICoreAgent):
    """PydanticAI document agent."""

    def __init__(
        self,
        context: DocumentAgentContext,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(
            context.config, conversation_manager, pydantic_ai_agent, agent_deps
        )
        self.context = context

    @classmethod
    async def create(
        cls,
        document: Union[str, int, Document],
        corpus: Union[str, int, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[list[Callable]] = None,
        *,
        conversation: Optional[Conversation] = None,
        **kwargs: Any,
    ) -> "PydanticAIDocumentAgent":
        """Create a Pydantic-AI document agent tied to a specific corpus."""
        if config is None:
            config = get_default_config()

        logger.debug(
            f"Creating Pydantic-AI document agent for document {document} and corpus {corpus}"
        )
        logger.debug(f"Config (type {type(config)}): {config}")
        # Provide explicit corpus so the factory can pick the proper embedder
        context = await CoreDocumentAgentFactory.create_context(
            document,
            corpus,
            config,
        )

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_document(
            context.corpus,
            context.document,
            user_id=config.user_id,
            config=config,
            override_conversation=conversation,
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation
        model_settings = _prepare_pydantic_ai_model_settings(config)

        # ------------------------------------------------------------------
        # Ensure a vector search tool is always available so that the agent
        # can reference the primary document and emit `sources`.
        # ------------------------------------------------------------------
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            embedder_path=config.embedder_path,
        )

        # Default vector search tool: bound method on the store. Pydantic-AI
        # will inspect the signature (query: str, k: int) and build the
        # schema automatically.
        default_vs_tool: Callable = vector_store.similarity_search

        # -----------------------------
        # Document-specific async tools
        # -----------------------------
        async def load_document_summary_tool(
            truncate_length: int | None = None,
            from_start: bool = True,
        ) -> str:
            """Load the document's markdown summary (optionally truncated)."""
            return await aload_document_md_summary(
                context.document.id, truncate_length, from_start
            )

        async def get_summary_token_length_tool() -> int:
            """Return token length of the document's markdown summary."""
            return await aget_md_summary_token_length(context.document.id)

        async def get_document_notes_tool() -> list[dict[str, Any]]:
            """Retrieve metadata & first 512-char preview of notes for this document."""
            return await aget_notes_for_document_corpus(
                context.document.id, context.corpus.id
            )

        async def load_document_text_tool(
            start: int | None = None,
            end: int | None = None,
            refresh: bool = False,
        ) -> str:
            """Return a slice of the document's plain-text extract."""
            return await aload_document_txt_extract(
                context.document.id, start, end, refresh=refresh
            )

        # Wrap with PydanticAI factory
        load_summary_tool = PydanticAIToolFactory.from_function(
            load_document_summary_tool,
            name="load_document_summary",
            description="Load the markdown summary of the document. Optionally truncate by length and direction.",
            parameter_descriptions={
                "truncate_length": "Optional number of characters to truncate the summary to",
                "from_start": "If True, truncate from start; if False, truncate from end",
            },
        )

        get_summary_length_tool = PydanticAIToolFactory.from_function(
            get_summary_token_length_tool,
            name="get_summary_token_length",
            description="Get the approximate token length of the document's markdown summary.",
        )

        get_notes_tool = PydanticAIToolFactory.from_function(
            get_document_notes_tool,
            name="get_document_notes",
            description="Retrieve all notes attached to this document in the current corpus.",
        )

        load_text_tool = PydanticAIToolFactory.from_function(
            load_document_text_tool,
            name="load_document_text",
            description="Load the document's plain-text extract (full or partial).",
            parameter_descriptions={
                "start": "Inclusive start character index (default 0)",
                "end": "Exclusive end character index (defaults to end of file)",
                "refresh": "If true, refresh the cached content from disk",
            },
        )

        # -----------------------------
        # Document summary tools (new)
        # -----------------------------
        async def get_document_summary_tool(
            truncate_length: int | None = None,
            from_start: bool = True,
        ) -> str:
            """Return the latest summary content for this document."""
            return await aget_document_summary(
                document_id=context.document.id,
                corpus_id=context.corpus.id,
                truncate_length=truncate_length,
                from_start=from_start,
            )

        get_summary_content_wrapped = PydanticAIToolFactory.from_function(
            get_document_summary_tool,
            name="get_document_summary",
            description="Retrieve the latest markdown summary content for the current document.",
            parameter_descriptions={
                "truncate_length": "Optionally truncate to this many characters",
                "from_start": "If true, truncate from the beginning; otherwise from the end",
            },
        )

        async def get_document_summary_diff_tool(from_version: int, to_version: int):
            """Return unified diff between two document summary versions."""
            return await aget_document_summary_diff(
                document_id=context.document.id,
                corpus_id=context.corpus.id,
                from_version=from_version,
                to_version=to_version,
            )

        async def update_document_summary_tool(new_content: str):
            """Update (or create) the document summary, returning version info."""
            logger.info(f"Updating document summary with content: {new_content}")
            return await aupdate_document_summary(
                document_id=context.document.id,
                corpus_id=context.corpus.id,
                new_content=new_content,
                author_id=config.user_id,
            )

        async def get_document_summary_versions_tool(limit: int | None = None):
            """Return version history for the document summary."""
            return await aget_document_summary_versions(
                document_id=context.document.id,
                corpus_id=context.corpus.id,
                limit=limit,
            )

        get_summary_versions_wrapped = PydanticAIToolFactory.from_function(
            get_document_summary_versions_tool,
            name="get_document_summary_versions",
            description="Get version history for the document summary.",
            parameter_descriptions={
                "limit": "Optional maximum number of versions to return (newest first)",
            },
        )

        get_summary_diff_wrapped = PydanticAIToolFactory.from_function(
            get_document_summary_diff_tool,
            name="get_document_summary_diff",
            description="Get unified diff between two summary versions.",
            parameter_descriptions={
                "from_version": "Starting version number",
                "to_version": "Ending version number",
            },
        )

        update_summary_wrapped = PydanticAIToolFactory.from_function(
            update_document_summary_tool,
            name="update_document_summary",
            description="Create or update the document summary (requires approval).",
            parameter_descriptions={
                "new_content": "Full markdown content for the new summary version",
            },
            requires_approval=True,
        )

        # -----------------------------
        # New note manipulation tools
        # -----------------------------

        async def add_document_note_tool(title: str, content: str) -> dict[str, int]:
            """Create a new note attached to this document and return its id."""
            note = await aadd_document_note(
                document_id=context.document.id,
                title=title,
                content=content,
                creator_id=config.user_id,
                corpus_id=context.corpus.id,
            )
            return {"note_id": note.id}

        async def update_document_note_tool(
            note_id: int, new_content: str
        ) -> dict[str, int | None]:
            """Version-up an existing note and return new version number."""
            rev = await aupdate_document_note(
                note_id=note_id,
                new_content=new_content,
                author_id=config.user_id,
            )
            version = rev.version if rev else None
            return {"version": version}

        async def search_document_notes_tool(
            search_term: str, limit: int | None = None
        ):
            """Search notes attached to this document for a keyword."""
            return await asearch_document_notes(
                document_id=context.document.id,
                search_term=search_term,
                corpus_id=context.corpus.id,
                limit=limit,
            )

        add_note_tool_wrapped = PydanticAIToolFactory.from_function(
            add_document_note_tool,
            name="add_document_note",
            description="Create a new note attached to the current document in this corpus.",
            parameter_descriptions={
                "title": "Title of the note",
                "content": "Full markdown content of the note",
            },
            requires_approval=True,
        )

        update_note_tool_wrapped = PydanticAIToolFactory.from_function(
            update_document_note_tool,
            name="update_document_note",
            description="Update an existing note's content, creating a new revision.",
            parameter_descriptions={
                "note_id": "ID of the note to update",
                "new_content": "New note content (markdown)",
            },
            requires_approval=True,
        )

        search_notes_tool_wrapped = PydanticAIToolFactory.from_function(
            search_document_notes_tool,
            name="search_document_notes",
            description="Search notes for a keyword (title or content)",
            parameter_descriptions={
                "search_term": "Keyword or phrase to search for (case-insensitive)",
                "limit": "Maximum number of results to return",
            },
        )

        # -----------------------------
        # Annotation manipulation tools (write – require approval)
        # -----------------------------

        async def duplicate_annotations_tool(
            annotation_ids: list[int],
            new_label_text: str,
            label_type: str | None = None,
        ) -> dict[str, list[int]]:
            """Duplicate existing annotations in the current document with a new label.

            Args:
                annotation_ids: IDs of annotations to duplicate.
                new_label_text: Text for the new annotation label.
                label_type: Optional label type.

            Returns:
                Dict with key ``annotation_ids`` listing newly created IDs.
            """

            new_ids = await aduplicate_annotations_with_label(
                annotation_ids,
                new_label_text=new_label_text,
                creator_id=config.user_id,
                label_type=label_type,
            )
            return {"annotation_ids": new_ids}

        from pydantic import BaseModel, Field

        class ExactStringEntry(BaseModel):
            """Structured entry for an exact‐string annotation request."""

            label_text: str = Field(..., description="Text of the annotation label")
            exact_string: str = Field(..., description="Exact string to annotate")

        async def add_exact_string_annotations_tool(
            entries: list[ExactStringEntry],
        ) -> dict[str, list[int]]:
            """Create annotations for *exact* string matches in the current document.

            Each *entry* provides ``label_text`` and ``exact_string``.  The tool
            automatically applies all entries to the current document & corpus.
            """

            # Accept both ExactStringEntry instances *and* plain dicts coming
            # back from the approval metadata.
            norm_entries: list[ExactStringEntry] = []
            for ent in entries:
                if isinstance(ent, ExactStringEntry):
                    norm_entries.append(ent)
                elif isinstance(ent, dict):
                    try:
                        norm_entries.append(ExactStringEntry(**ent))
                    except Exception as _exc:  # pragma: no cover – validation guard
                        raise ValueError(
                            "Invalid entry format for add_exact_string_annotations"
                        ) from _exc
                else:  # pragma: no cover – defensive
                    raise TypeError(
                        "Unsupported entry type for add_exact_string_annotations"
                    )

            items = [
                (e.label_text, e.exact_string, context.document.id, context.corpus.id)
                for e in norm_entries
            ]

            new_ids = await aadd_annotations_from_exact_strings(
                items, creator_id=config.user_id
            )
            return {"annotation_ids": new_ids}

        duplicate_ann_tool_wrapped = PydanticAIToolFactory.from_function(
            duplicate_annotations_tool,
            name="duplicate_annotations",
            description="Duplicate existing annotations with a new label (requires approval).",
            parameter_descriptions={
                "annotation_ids": "List of source annotation IDs",
                "new_label_text": "Text for the new label",
                "label_type": "Optional label type override",
            },
            requires_approval=True,
        )

        add_exact_ann_tool_wrapped = PydanticAIToolFactory.from_function(
            add_exact_string_annotations_tool,
            name="add_exact_string_annotations",
            description="Add annotations for exact string matches in the current document (requires approval).",
            parameter_descriptions={
                "entries": "List of objects with keys 'label_text' and 'exact_string'",
            },
            requires_approval=True,
        )

        # Merge caller-supplied tools (if any) after the default one so callers
        # can override behaviour/order if desired.
        effective_tools: list[Callable] = [
            default_vs_tool,
            load_summary_tool,
            get_summary_length_tool,
            get_notes_tool,
            load_text_tool,
            search_notes_tool_wrapped,
            # Write operations below – all require approval
            add_note_tool_wrapped,
            update_note_tool_wrapped,
            duplicate_ann_tool_wrapped,
            add_exact_ann_tool_wrapped,
            get_summary_content_wrapped,
            get_summary_versions_wrapped,
            get_summary_diff_wrapped,
            update_summary_wrapped,
        ]
        if tools:
            effective_tools.extend(tools)

        logger.info(f"Created pydantic ai agent with context {config.system_prompt}")
        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=effective_tools,
            model_settings=model_settings,
        )

        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            document_id=context.document.id,
            **kwargs,
        )

        agent_deps_instance.vector_store = vector_store

        return cls(
            context=context,
            conversation_manager=conversation_manager,
            pydantic_ai_agent=pydantic_ai_agent_instance,
            agent_deps=agent_deps_instance,
        )


class PydanticAICorpusAgent(PydanticAICoreAgent):
    """PydanticAI corpus agent."""

    def __init__(
        self,
        context: CorpusAgentContext,
        conversation_manager: CoreConversationManager,
        pydantic_ai_agent: PydanticAIAgent,
        agent_deps: PydanticAIDependencies,
    ):
        super().__init__(
            context.config, conversation_manager, pydantic_ai_agent, agent_deps
        )
        self.context = context

    @classmethod
    async def create(
        cls,
        corpus: Union[int, str, Corpus],
        config: Optional[AgentConfig] = None,
        tools: Optional[list[Callable]] = None,
        conversation: Optional[Conversation] = None,
        **kwargs,
    ) -> "PydanticAICorpusAgent":
        """Create a PydanticAI corpus agent using core functionality."""
        if config is None:
            config = get_default_config()

        if not isinstance(corpus, Corpus):  # Ensure corpus is loaded if ID is passed
            corpus_obj = await Corpus.objects.aget(id=corpus)
        else:
            corpus_obj = corpus

        context = await CoreCorpusAgentFactory.create_context(corpus_obj, config)

        # Use the CoreConversationManager factory method
        conversation_manager = await CoreConversationManager.create_for_corpus(
            corpus=corpus_obj,
            user_id=config.user_id,
            config=config,
            override_conversation=conversation,
        )
        # Ensure the agent's config has the potentially newly created/loaded conversation
        config.conversation = conversation_manager.conversation

        # Resolve embedder_path asynchronously if not already set
        if config.embedder_path is None and corpus_obj and corpus_obj.id:
            logger.debug(
                f"Attempting to derive embedder_path for corpus {corpus_obj.id} asynchronously."
            )
            try:
                _, resolved_embedder_path = await aget_embedder(corpus_id=corpus_obj.id)
                if resolved_embedder_path:
                    config.embedder_path = resolved_embedder_path
                    logger.debug(f"Derived embedder_path: {config.embedder_path}")
                else:
                    logger.warning(
                        f"Could not derive embedder_path for corpus {corpus_obj.id}."
                    )
            except Exception as e:
                logger.warning(
                    f"Error deriving embedder_path for corpus {corpus_obj.id}: {e}"
                )

        model_settings = _prepare_pydantic_ai_model_settings(config)

        # ------------------------------------------------------------------
        # Ensure a vector search tool is always available so that the agent
        # can reference the primary document and emit `sources`.
        # ------------------------------------------------------------------
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=config.user_id,
            corpus_id=context.corpus.id,
            embedder_path=config.embedder_path,
        )

        # Default vector search tool: bound method on the store. Pydantic-AI
        # will inspect the signature (query: str, k: int) and build the
        # schema automatically.
        default_vs_tool: Callable = vector_store.similarity_search

        # -----------------------------
        # Corpus description tools
        # -----------------------------

        async def get_corpus_description_tool(
            truncate_length: int | None = None,
            from_start: bool = True,
        ) -> str:
            """Return the current corpus markdown description (optionally truncated)."""
            return await aget_corpus_description(
                corpus_id=context.corpus.id,
                truncate_length=truncate_length,
                from_start=from_start,
            )

        async def update_corpus_description_tool(
            new_content: str,
        ) -> dict[str, int | None]:
            """Update the corpus description and return new version number (if changed)."""
            rev = await aupdate_corpus_description(
                corpus_id=context.corpus.id,
                new_content=new_content,
                author_id=config.user_id,
            )
            version = rev.version if rev else None
            return {"version": version}

        get_corpus_desc_tool_wrapped = PydanticAIToolFactory.from_function(
            get_corpus_description_tool,
            name="get_corpus_description",
            description="Retrieve the latest markdown description for this corpus.",
            parameter_descriptions={
                "truncate_length": "Optionally truncate the description to this many characters",
                "from_start": "If true, truncate from beginning else from end",
            },
        )

        update_corpus_desc_tool_wrapped = PydanticAIToolFactory.from_function(
            update_corpus_description_tool,
            name="update_corpus_description",
            description="Update corpus description with new markdown text, creating a revision if changed.",
            parameter_descriptions={
                "new_content": "Full markdown content",
            },
        )

        # -----------------------------
        # Document coordination tools – empower corpus agent to talk to per-document agents
        # -----------------------------

        from opencontractserver.llms import (
            agents as _agents_api,  # local import to avoid circulars
        )
        from opencontractserver.llms.types import AgentFramework as _AgentFramework

        async def list_documents_tool() -> list[dict[str, Any]]:
            """Return basic metadata for all documents in the current corpus.

            Each list entry contains ``document_id``, ``title`` and ``description`` so
            the coordinator LLM can decide which document-specific agent to consult.
            """
            return [
                {
                    "document_id": doc.id,
                    "title": doc.title,
                    "description": getattr(doc, "description", ""),
                }
                for doc in context.documents
            ]

        async def ask_document_tool(document_id: int, question: str) -> dict[str, Any]:
            """Ask a question to a **document-specific** agent inside this corpus.

            The call transparently streams the document agent so we can capture
            its *full* reasoning timeline (tool calls, vector-search citations…)
            and surface that back to the coordinator LLM.

            Args:
                document_id: ID of the target document (must belong to this corpus).
                question:   The natural-language question to forward.

            Returns:
                An object with keys:
                    answer (str)   – final assistant answer
                    sources (list) – flattened source dicts
                    timeline (list) – detailed reasoning/events emitted by the sub-agent
            """

            from pydantic import BaseModel, Field

            class DocAnswer(BaseModel):
                """Structured result returned by the `ask_document` tool."""

                answer: str = Field(description="The document agent's final answer")
                sources: list[dict] = Field(
                    default_factory=list,
                    description="Flattened citation objects produced by the document agent",
                )
                timeline: list[dict] = Field(
                    default_factory=list,
                    description="Event timeline (thoughts, tool calls, etc.) from the document agent run",
                )

            # Guard against cross-corpus leakage
            if document_id not in {d.id for d in context.documents}:
                raise ValueError("Document does not belong to current corpus")

            doc_agent = await _agents_api.for_document(
                document=document_id,
                corpus=context.corpus.id,
                user_id=config.user_id,
                store_user_messages=False,
                store_llm_messages=False,
                framework=_AgentFramework.PYDANTIC_AI,
            )

            # Side-channel observer from AgentConfig (set by WebSocket layer)
            observer_cb = getattr(config, "stream_observer", None)

            accumulated_answer: str = ""
            captured_sources: list[dict] = []
            captured_timeline: list[dict] = []

            async for ev in doc_agent.stream(question):
                # Capture content
                if getattr(ev, "type", "") == "content":
                    accumulated_answer += getattr(ev, "content", "")

                # Forward raw event upstream (side-channel)
                if callable(observer_cb):
                    try:
                        await observer_cb(ev)
                    except Exception:
                        logger.exception("stream_observer raised during ask_document")

                # Capture mid-stream sources
                if getattr(ev, "type", "") == "sources":
                    captured_sources.extend([s.to_dict() for s in ev.sources])

                # Capture timeline (thought events etc.)
                if getattr(ev, "type", "") == "thought":
                    captured_timeline.append(
                        {
                            "type": ev.type,
                            "thought": ev.thought,
                            "metadata": ev.metadata,
                        }
                    )

                if getattr(ev, "type", "") == "final":
                    # Merge any final sources / timeline injected by the adapter
                    captured_sources = [
                        s.to_dict() for s in ev.sources
                    ] or captured_sources
                    if isinstance(ev.metadata, dict) and ev.metadata.get("timeline"):
                        captured_timeline = ev.metadata["timeline"]

            return DocAnswer(
                answer=accumulated_answer,
                sources=captured_sources,
                timeline=captured_timeline,
            ).model_dump()

        list_docs_tool_wrapped = PydanticAIToolFactory.from_function(
            list_documents_tool,
            name="list_documents",
            description="List all documents in the current corpus with basic metadata.",
        )

        ask_doc_tool_wrapped = PydanticAIToolFactory.from_function(
            ask_document_tool,
            name="ask_document",
            description="Delegate a question to a document-specific agent and return its answer and sources.",
            parameter_descriptions={
                "document_id": "ID of the document to query (must be in this corpus)",
                "question": "The natural-language question to ask the document agent",
            },
        )

        # Merge caller-supplied tools (if any) after the default ones so callers can
        # override behaviour/order if desired.
        effective_tools: list[Callable] = [
            default_vs_tool,
            get_corpus_desc_tool_wrapped,
            update_corpus_desc_tool_wrapped,
            list_docs_tool_wrapped,
            ask_doc_tool_wrapped,
        ]
        if tools:
            effective_tools.extend(tools)

        pydantic_ai_agent_instance = PydanticAIAgent(
            model=config.model_name,
            system_prompt=config.system_prompt,
            deps_type=PydanticAIDependencies,
            tools=effective_tools,
            model_settings=model_settings,
        )

        agent_deps_instance = PydanticAIDependencies(
            user_id=config.user_id, corpus_id=context.corpus.id, **kwargs
        )

        agent_deps_instance.vector_store = vector_store

        return cls(
            context=context,
            conversation_manager=conversation_manager,
            pydantic_ai_agent=pydantic_ai_agent_instance,
            agent_deps=agent_deps_instance,
        )


# --------------------------------------------------------------------------- #
# helpers – rich‐event extraction                                            #
# --------------------------------------------------------------------------- #


def _event_to_text_and_meta(event: Any) -> tuple[str, bool, dict[str, Any]]:
    """Convert a *model* stream event (PartStart/Delta) to `(text, is_answer, meta)`.

    Args:
        event: The incoming event from `node.stream()`.

    Returns:
        text: ``str`` representation – empty if nothing user-visible.
        is_answer: ``True`` if this text counts towards the assistant's final
                   answer (i.e. *only* TextPart/Delta).
        meta: Any additional metadata extracted (e.g. tool name & args).
    """

    text: str = ""
    is_answer = False
    meta: dict[str, Any] = {}

    if isinstance(event, PartStartEvent):
        part = event.part
    elif isinstance(event, PartDeltaEvent):
        part = event.delta
    else:
        return text, is_answer, meta  # unsupported event

    # ------------------------------------------------------------------
    # Full parts
    # ------------------------------------------------------------------
    if isinstance(part, TextPart):
        text = part.content
        is_answer = True
    elif isinstance(part, ToolCallPart):
        # Tool invocation text should not reach the user; surface via metadata only.
        meta = {"tool_name": part.tool_name, "args": part.args}
        text = ""  # suppress chatter
    elif isinstance(part, TextPartDelta):
        text = part.content_delta
        is_answer = True
    elif isinstance(part, ToolCallPartDelta):
        # Suppress incremental tool chatter as well
        meta = {
            "tool_name_delta": part.tool_name_delta,
            "args_delta": part.args_delta,
        }
        text = ""

    return text, is_answer, meta


def _usage_to_dict(usage: Any) -> Optional[dict[str, Any]]:
    """
    Convert a pydantic-ai ``Usage`` instance (or any other arbitrary object)
    into a plain ``dict`` that can be attached to message metadata.
    Falls back to ``vars()`` if no structured helper is available.
    """
    logger.info(f"[_usage_to_dict] Starting conversion of usage object: {usage!r}")

    if usage is None:  # noqa: D401 – early-exit guard
        logger.debug("[_usage_to_dict] Usage object is None, returning None")
        return None

    if hasattr(usage, "model_dump"):  # pydantic v2
        logger.info(
            "[_usage_to_dict] Found model_dump method, using pydantic v2 conversion"
        )
        result = usage.model_dump()  # type: ignore[arg-type]
        logger.info(f"[_usage_to_dict] Pydantic v2 conversion result: {result!r}")
        return result

    if dataclasses.is_dataclass(usage):  # dataclass
        logger.info("[_usage_to_dict] Object is a dataclass, using dataclasses.asdict")
        result = dataclasses.asdict(usage)
        logger.info(f"[_usage_to_dict] Dataclass conversion result: {result!r}")
        return result

    logger.warning(
        f"[_usage_to_dict] No conversion method found for usage object: {usage!r}"
    )
    return None
