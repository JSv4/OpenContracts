# ---------------------------------------------------------------------------
# Prevent marvin/tiktoken network call during Django app loading
# ---------------------------------------------------------------------------

import sys
import types

if "marvin" not in sys.modules:  # pragma: no cover – only in minimal CI env
    _marvin_stub = types.ModuleType("marvin")
    _marvin_ai_stub = types.ModuleType("marvin.ai")
    _marvin_stub.ai = _marvin_ai_stub  # type: ignore[attr-defined]
    sys.modules["marvin"] = _marvin_stub
    sys.modules["marvin.ai"] = _marvin_ai_stub

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.agent_factory import UnifiedAgentFactory
from opencontractserver.llms.agents.core_agents import (
    ApprovalNeededEvent,
    MessageState,
    UnifiedChatResponse,
)
from opencontractserver.llms.exceptions import ToolConfirmationRequired
from opencontractserver.llms.tools.tool_factory import CoreTool
from opencontractserver.llms.types import AgentFramework

User = get_user_model()


# ---------------------------------------------------------------------------
# Helper CoreTool that always requires approval
# ---------------------------------------------------------------------------


def restricted_tool(x: int) -> int:
    """A dummy tool we will flag as sensitive."""
    return x * 2


SENSITIVE_TOOL = CoreTool.from_function(restricted_tool, requires_approval=True)


class TestToolApprovalGate(TestCase):
    """End-to-end tests for the approval-gate pause / resume flow."""

    @classmethod
    def setUpTestData(cls):  # noqa: D401 – Django test-data hook
        user = User.objects.create_user(username="gateuser", password="pass")
        cls.user = user
        cls.corpus = Corpus.objects.create(
            title="Gate Corpus", description="test", creator=user, is_public=True
        )
        cls.doc = Document.objects.create(
            title="Gate Doc", description="doc", creator=user, is_public=True
        )
        cls.corpus.documents.add(cls.doc)

    # ------------------------------------------------------------------
    # Utility: patch PydanticAIAgent to raise ToolConfirmationRequired once
    # then return a dummy result thereafter.
    # ------------------------------------------------------------------

    def _patch_pydantic_ai(self, mock_cls: MagicMock):
        """Configure the PydanticAIAgent mock with desired side-effects."""

        class _DummyRunResult:
            def __init__(self, text: str):
                self.data = text
                self.sources: list[Any] = []

            def usage(self):  # noqa: D401 – simple stub
                return None

        # First call → raise, subsequent → success
        run_call_state = {"count": 0}

        def run_side_effect(*args, **kwargs):  # noqa: D401 – stub
            run_call_state["count"] += 1
            if run_call_state["count"] == 1:
                raise ToolConfirmationRequired(
                    tool_name="restricted_tool",
                    tool_args={"x": 7},
                    tool_call_id="tc-1",
                )
            return _DummyRunResult("resumed ok")

        mock_inst = MagicMock()
        mock_inst.run = AsyncMock(side_effect=run_side_effect)

        # Provide an async-context-manager stub for .iter()
        class _IterStub:
            def __init__(self, *a, **kw):
                pass

            async def __aenter__(self_inner):  # noqa: D401 – CM prototypical
                # On first acquisition raise gating exception to simulate pause
                raise ToolConfirmationRequired(
                    tool_name="restricted_tool",
                    tool_args={"x": 7},
                    tool_call_id="tc-stream",
                )

            async def __aexit__(self_inner, exc_type, exc, tb):  # noqa: D401 – stub
                return False

        mock_inst.iter = MagicMock(side_effect=lambda *a, **kw: _IterStub())

        mock_cls.return_value = mock_inst
        return mock_inst

    # ------------------------------------------------------------------
    # CHAT – pause + resume (approved)
    # ------------------------------------------------------------------

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent")
    @pytest.mark.django_db(transaction=True)
    @pytest.mark.asyncio
    async def test_chat_pause_and_resume(self, mock_pyd_ai_cls):

        # ensure pydantic_ai patched
        self._patch_pydantic_ai(mock_pyd_ai_cls)

        # Create agent via unified factory so real conversation manager is used
        agent = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            tools=[SENSITIVE_TOOL],
        )

        # --------------- first call pauses -----------------
        resp = await agent.chat("trigger sensitive action", store_messages=True)
        assert isinstance(resp, UnifiedChatResponse)
        assert resp.metadata["state"] == MessageState.AWAITING_APPROVAL
        msg_id = resp.llm_message_id

        # DB record should be flagged as awaiting_approval
        from opencontractserver.conversations.models import ChatMessage

        paused_msg = await ChatMessage.objects.aget(id=msg_id)
        assert paused_msg.data["state"] == MessageState.AWAITING_APPROVAL

        # --------------- resume approved -------------------
        resumed = await agent.resume_with_approval(msg_id, approved=True)
        assert isinstance(resumed, UnifiedChatResponse)
        assert "resumed ok" in resumed.content

        # ---------------- DB assertions -----------------
        conv_id = agent.get_conversation_id()

        # All messages for this conversation
        all_msgs = [
            m async for m in ChatMessage.objects.filter(conversation_id=conv_id)
        ]
        awaiting = [
            m for m in all_msgs if m.data.get("state") == MessageState.AWAITING_APPROVAL
        ]
        self.assertFalse(
            awaiting, "Paused message should be marked completed after approval"
        )

        # Ensure a later LLM message contains the approved content
        resumed_msgs = [m for m in all_msgs if "resumed ok" in m.content]
        self.assertTrue(resumed_msgs, "Resumed LLM message not stored in DB")

        # Audit message with approval_decision == approved exists
        approved_audit = [
            m for m in all_msgs if m.data.get("approval_decision") == "approved"
        ]
        self.assertTrue(approved_audit, "Approved audit log not stored in DB")

    # ------------------------------------------------------------------
    # STREAM – yields ApprovalNeededEvent
    # ------------------------------------------------------------------

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent")
    @pytest.mark.django_db(transaction=True)
    @pytest.mark.asyncio
    async def test_stream_emits_approval_event(self, mock_pyd_ai_cls):
        self._patch_pydantic_ai(mock_pyd_ai_cls)

        agent = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            tools=[SENSITIVE_TOOL],
            streaming=True,
        )

        events = []
        async for evt in agent.stream("trigger stream"):
            events.append(evt)
            if isinstance(evt, ApprovalNeededEvent):
                break  # we got what we want

        assert any(isinstance(e, ApprovalNeededEvent) for e in events)

    # ------------------------------------------------------------------
    # resume_with_approval – rejection branch
    # ------------------------------------------------------------------

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent")
    @pytest.mark.django_db(transaction=True)
    @pytest.mark.asyncio
    async def test_resume_rejection(self, mock_pyd_ai_cls: MagicMock) -> None:
        """resume_with_approval works for the rejection branch."""
        self._patch_pydantic_ai(mock_pyd_ai_cls)
        agent = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            tools=[SENSITIVE_TOOL],
        )
        resp = await agent.chat("please run tool")
        msg_id = resp.llm_message_id

        # resume with rejected=False
        resumed = await agent.resume_with_approval(msg_id, approved=False)
        assert isinstance(resumed, UnifiedChatResponse)
        # Rejection path uses default dummy result; ensure placeholder text present
        assert "resumed ok" in resumed.content or resumed.content

        # Validate DB state – rejected result stored
        from opencontractserver.conversations.models import ChatMessage

        all_msgs = [
            m
            async for m in ChatMessage.objects.filter(
                conversation_id=agent.get_conversation_id()
            )
        ]
        rejected_msgs = [
            m for m in all_msgs if m.data.get("approval_decision") == "rejected"
        ]
        self.assertTrue(rejected_msgs, "Rejection result not stored in DB")

    # ------------------------------------------------------------------
    # Full round-trip: pause → new agent → approve → new agent again.
    # ------------------------------------------------------------------

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent")
    @pytest.mark.django_db(transaction=True)
    @pytest.mark.asyncio
    async def test_roundtrip_pause_resume_across_agents(self, mock_pyd_ai):
        """Ensure state is persisted and reloadable across agent instances."""

        self._patch_pydantic_ai(mock_pyd_ai)

        # 1) Initial agent – pause
        agent1 = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            tools=[SENSITIVE_TOOL],
        )

        resp_pause = await agent1.chat("pause please")
        convo_id = agent1.get_conversation_id()
        llm_msg_id = resp_pause.llm_message_id

        # 2) New agent – same conversation – approve
        agent2 = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            conversation_id=convo_id,
            tools=[SENSITIVE_TOOL],
        )

        await agent2.resume_with_approval(llm_msg_id, approved=True)

        # 3) Third agent – reload conversation; ensure no pending approvals
        agent3 = await UnifiedAgentFactory.create_document_agent(
            self.doc.id,
            self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            conversation_id=convo_id,
            tools=[SENSITIVE_TOOL],
        )

        msgs = await agent3.get_conversation_messages()
        pending = [
            m for m in msgs if m.data.get("state") == MessageState.AWAITING_APPROVAL
        ]
        self.assertFalse(
            pending, "No messages should remain in awaiting_approval state after resume"
        )

        # Latest LLM message should contain approved result
        last_llm = [m for m in msgs if m.msg_type == "LLM"][-1]
        self.assertIn("resumed ok", last_llm.content)
