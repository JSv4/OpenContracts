from __future__ import annotations

"""Regression tests for new public-/private-corpus logic in the LLM framework.

These tests focus on lower-level behaviour (agent API) instead of the
websocket consumer layer because we only need to verify that:

1.  Public corpuses never persist chat messages – even for authenticated
    users – **and** when the caller explicitly requests ``persist=False``.
2.  Approval-gated tools are silently stripped when the target context is
    public so the agent never receives them.
3.  Anonymous access to private corpuses/documents is rejected with a
    :class:`PermissionError` raised by the factory layer.

The fixtures provided by :class:`~opencontractserver.tests.base.BaseFixtureTestCase`
already include a test user (``self.user``) plus at least one
document/corpus.  We simply toggle the ``is_public`` flag between test
cases.
"""

import pytest
import vcr

from django.db.models import Q

from opencontractserver.llms import agents as llm_agents
from opencontractserver.llms.tools.tool_factory import CoreTool
from opencontractserver.tests.base import BaseFixtureTestCase
from opencontractserver.conversations.models import ChatMessage

@pytest.mark.django_db(transaction=True)
class PublicCorpusPersistenceTestCase(BaseFixtureTestCase):
    """Ensure that message persistence is disabled for *public* corpuses."""

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_public_persists_false.yaml",
        filter_headers=["authorization"],
    )
    async def test_public_persists_false(self):  # noqa: D401 – test function
        """Agent created for a **public** corpus must not write ChatMessage rows."""

        # Mark the fixture corpus as public.
        self.corpus.is_public = True
        await self.corpus.asave(update_fields=["is_public"])

        # Sanity: no chat messages exist before the test.
        baseline_msg_count = await ChatMessage.objects.all().acount()   # type: ignore[attr-defined]

        # Authenticated user but public corpus – persistence should still be off.
        agent = await llm_agents.for_corpus(corpus=self.corpus.id, user_id=self.user.id)

        # Trigger a simple chat; content is irrelevant for the assertion.
        await agent.chat("Hello, public world!")

        # Conversation must be anonymous (None) and DB row count unchanged.
        assert agent.get_conversation_id() is None
        assert await ChatMessage.objects.all().acount() == baseline_msg_count  # type: ignore[attr-defined]

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_public_persist_flag_false.yaml",
        filter_headers=["authorization"],
    )
    async def test_public_persist_flag_false(self):  # noqa: D401
        """Explicit ``persist=False`` also disables storage for any corpus."""

        # Use private corpus but ask API not to persist.
        baseline = await ChatMessage.objects.all().acount()  # type: ignore[attr-defined]

        agent = await llm_agents.for_corpus(
            corpus=self.corpus.id,
            user_id=self.user.id,
            persist=False,
        )

        await agent.chat("Do not save me, please.")

        assert agent.get_conversation_id() is None
        assert await ChatMessage.objects.all().acount() == baseline  # type: ignore[attr-defined]


@pytest.mark.django_db(transaction=True)
class PublicToolFilteringTestCase(BaseFixtureTestCase):
    """Verify that approval-gated tools are filtered in public context."""

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_tool_filtering_public.yaml",
        filter_headers=["authorization"],
    )
    async def test_tool_filtering_public(self):  # noqa: D401 – test function
        # Public corpus.
        self.corpus.is_public = True
        await self.corpus.asave(update_fields=["is_public"])

        # Define a noop function and wrap as approval-required CoreTool.
        def _dangerous(_: str) -> str:  # pragma: no cover
            return "should never run"

        dangerous_tool = CoreTool.from_function(
            _dangerous,
            name="dangerous_noop",
            description="A tool that should be gated.",
            requires_approval=True,
        )

        agent = await llm_agents.for_corpus(
            corpus=self.corpus.id,
            tools=[dangerous_tool],
        )

        # Agent.config.tools must not include the dangerous tool.
        assert all(getattr(t, "requires_approval", False) is False for t in agent.config.tools)


@pytest.mark.django_db(transaction=True)
class PermissionGuardTestCase(BaseFixtureTestCase):
    """Anonymous users must be blocked from private corpuses."""

    @vcr.use_cassette(
        "fixtures/vcr_cassettes/test_permission_guard_private.yaml",
        filter_headers=["authorization"],
    )
    async def test_permission_guard_private(self):  # noqa: D401
        # Ensure corpus is private (default is False already but be explicit).
        self.corpus.is_public = False
        await self.corpus.asave(update_fields=["is_public"])

        with pytest.raises(PermissionError):
            await llm_agents.for_corpus(corpus=self.corpus.id, user_id=None) 