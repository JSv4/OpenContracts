"""
Tests for the UnifiedAgentFactory and related tool conversion logic.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.agent_factory import (
    UnifiedAgentFactory,
    _convert_tools_for_framework,
)
from opencontractserver.llms.agents.core_agents import AgentConfig, CoreAgent
from opencontractserver.llms.tools.tool_factory import (
    CoreTool,
)
from opencontractserver.llms.tools.tool_factory import (
    UnifiedToolFactory as CoreUnifiedToolFactory,  # Alias to avoid confusion
)
from opencontractserver.llms.types import AgentFramework

User = get_user_model()


class TestAgentFactorySetup(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="factory_testuser", password="password", email="factory@test.com"
        )
        cls.corpus1 = Corpus.objects.create(
            title="Factory Test Corpus 1", creator=cls.user
        )
        cls.doc1 = Document.objects.create(
            title="Factory Test Doc 1", corpus=cls.corpus1, creator=cls.user
        )

        def dummy_callable_tool(q: str) -> str:
            return f"called: {q}"

        cls.callable_tool = dummy_callable_tool  # Store raw function
        cls.core_tool_instance = CoreTool.from_function(
            cls.callable_tool, name="dummy_core_from_callable"
        )


class TestUnifiedAgentFactory(TestAgentFactorySetup):

    async def test_create_document_agent_llama_index(self):
        """Test that LlamaIndex framework raises ValueError since it's not supported."""
        with self.assertRaises(ValueError) as cm:
            await UnifiedAgentFactory.create_document_agent(
                self.doc1,
                self.corpus1,
                framework=AgentFramework.LLAMA_INDEX,
                user_id=self.user.id,
                model="test_model",
            )
        self.assertIn("Unsupported framework:", str(cm.exception))

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIDocumentAgent")
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    @patch(f"{UnifiedAgentFactory.__module__}._convert_tools_for_framework")
    async def test_create_document_agent_pydantic_ai_with_tools(
        self,
        mock_convert_tools: MagicMock,
        mock_get_config: MagicMock,
        mock_pydantic_agent_class: MagicMock,
    ):
        mock_config = AgentConfig()
        mock_get_config.return_value = mock_config

        # Mock the agent instance
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        mock_pydantic_agent_class.create = AsyncMock(return_value=mock_agent_instance)

        raw_tools = [self.callable_tool]
        converted_framework_tools = [MagicMock()]  # Mocked converted tools
        mock_convert_tools.return_value = converted_framework_tools

        agent = await UnifiedAgentFactory.create_document_agent(
            self.doc1,
            self.corpus1,
            framework=AgentFramework.PYDANTIC_AI,
            tools=raw_tools,
        )

        mock_get_config.assert_called_once_with(
            user_id=None,
            model_name="gpt-4o-mini",
            system_prompt=None,
            temperature=0.7,
            max_tokens=None,
            streaming=True,
            conversation=None,
            conversation_id=None,
            loaded_messages=None,
            embedder_path=None,
            tools=raw_tools,
        )
        mock_convert_tools.assert_called_once_with(
            raw_tools, AgentFramework.PYDANTIC_AI
        )
        mock_pydantic_agent_class.create.assert_called_once()
        self.assertIs(agent, mock_agent_instance)

    async def test_create_corpus_agent_llama_index(self):
        """Test that LlamaIndex framework raises ValueError since it's not supported."""
        with self.assertRaises(ValueError) as cm:
            await UnifiedAgentFactory.create_corpus_agent(
                self.corpus1, framework=AgentFramework.LLAMA_INDEX
            )
        self.assertIn("Unsupported framework:", str(cm.exception))

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAICorpusAgent")
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    async def test_create_corpus_agent_pydantic_ai(
        self, mock_get_config: MagicMock, mock_pydantic_agent_class: MagicMock
    ):
        mock_config = AgentConfig()
        mock_get_config.return_value = mock_config

        # Mock the agent instance
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        mock_pydantic_agent_class.create = AsyncMock(return_value=mock_agent_instance)

        agent = await UnifiedAgentFactory.create_corpus_agent(
            self.corpus1, framework=AgentFramework.PYDANTIC_AI
        )

        mock_get_config.assert_called_once_with(
            user_id=None,
            model_name="gpt-4o-mini",  # Default from factory
            system_prompt=None,
            temperature=0.7,  # Default
            max_tokens=None,  # Default
            streaming=True,  # Default
            conversation=None,
            conversation_id=None,  # Default
            loaded_messages=None,
            embedder_path=None,
            tools=[],  # Default
        )
        mock_pydantic_agent_class.create.assert_called_once()
        self.assertIs(agent, mock_agent_instance)

    async def test_unsupported_framework_raises_error(self):
        """Test that invalid framework names raise ValueError."""
        with self.assertRaises(ValueError):
            await UnifiedAgentFactory.create_document_agent(
                self.doc1, self.corpus1, framework="invalid_framework_name"
            )
        with self.assertRaises(ValueError):
            await UnifiedAgentFactory.create_corpus_agent(
                self.corpus1, framework="invalid_framework_name"
            )

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIDocumentAgent")
    async def test_public_context_filters_approval_tools(
        self, mock_pydantic_agent_class: MagicMock
    ):
        """Test that approval-required tools are filtered out for public documents."""
        # Make corpus public
        self.corpus1.is_public = True
        await self.corpus1.asave()

        # Create a tool that requires approval
        approval_tool = CoreTool.from_function(
            lambda x: f"approval: {x}", name="approval_tool", requires_approval=True
        )

        # Create a tool that doesn't require approval
        normal_tool = CoreTool.from_function(
            lambda x: f"normal: {x}", name="normal_tool", requires_approval=False
        )

        # Mock the agent creation
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        mock_pydantic_agent_class.create = AsyncMock(return_value=mock_agent_instance)

        await UnifiedAgentFactory.create_document_agent(
            self.doc1,
            self.corpus1,
            framework=AgentFramework.PYDANTIC_AI,
            tools=[approval_tool, normal_tool],
        )

        # Check that create was called
        mock_pydantic_agent_class.create.assert_called_once()

        # Get the config that was passed to create
        call_args = mock_pydantic_agent_class.create.call_args
        config = call_args[0][2]  # Third argument is the config

        # Verify that approval tool was filtered out
        self.assertEqual(len(config.tools), 1)
        self.assertEqual(config.tools[0].name, "normal_tool")

    @patch("opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIDocumentAgent")
    async def test_corpus_required_tools_filtered_without_corpus(
        self, mock_pydantic_agent_class: MagicMock
    ):
        """Test that corpus-required tools are filtered when no corpus is provided."""
        # Create a tool that requires corpus
        corpus_tool = CoreTool.from_function(
            lambda x: f"corpus: {x}", name="corpus_tool", requires_corpus=True
        )

        # Create a tool that doesn't require corpus
        normal_tool = CoreTool.from_function(
            lambda x: f"normal: {x}", name="normal_tool", requires_corpus=False
        )

        # Mock the agent creation
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        mock_pydantic_agent_class.create = AsyncMock(return_value=mock_agent_instance)

        await UnifiedAgentFactory.create_document_agent(
            self.doc1,
            corpus=None,  # No corpus provided
            framework=AgentFramework.PYDANTIC_AI,
            tools=[corpus_tool, normal_tool],
        )

        # Get the config that was passed to create
        call_args = mock_pydantic_agent_class.create.call_args
        config = call_args[0][2]  # Third argument is the config

        # Verify that corpus tool was filtered out
        self.assertEqual(len(config.tools), 1)
        self.assertEqual(config.tools[0].name, "normal_tool")


class TestConvertToolsForFramework(TestAgentFactorySetup):
    @patch(f"{CoreTool.__module__}.CoreTool.from_function")
    @patch(
        f"{CoreUnifiedToolFactory.__module__}.{CoreUnifiedToolFactory.__name__}.create_tools"
    )
    def test_converts_callable_and_coretool_correctly(
        self, mock_core_create_tools: MagicMock, mock_coretool_from_function: MagicMock
    ):
        mocked_core_tool_from_callable = MagicMock(spec=CoreTool)
        mock_coretool_from_function.return_value = mocked_core_tool_from_callable

        final_framework_tools = [MagicMock()]  # What framework-specific factory returns
        mock_core_create_tools.return_value = final_framework_tools

        tools_input = [self.callable_tool, self.core_tool_instance]
        target_framework = AgentFramework.LLAMA_INDEX

        result = _convert_tools_for_framework(tools_input, target_framework)

        mock_coretool_from_function.assert_called_once_with(self.callable_tool)
        # CoreTool.from_function is called for the callable,
        # then these CoreTool objects are passed to CoreUnifiedToolFactory.create_tools
        mock_core_create_tools.assert_called_once_with(
            [mocked_core_tool_from_callable, self.core_tool_instance], target_framework
        )
        self.assertEqual(result, final_framework_tools)

    @patch(
        f"{CoreUnifiedToolFactory.__module__}.{CoreUnifiedToolFactory.__name__}.create_tools"
    )
    def test_ignores_invalid_tool_type(self, mock_core_create_tools: MagicMock):
        mock_core_create_tools.return_value = []

        invalid_tool = 123  # Not a callable or CoreTool
        tools_input = [self.callable_tool, invalid_tool, self.core_tool_instance]
        target_framework = AgentFramework.PYDANTIC_AI

        logger_name = "opencontractserver.llms.agents.agent_factory"
        with self.assertLogs(logger_name, level="WARNING") as cm:
            _convert_tools_for_framework(tools_input, target_framework)

        self.assertIn(
            f"WARNING:{logger_name}:Ignoring invalid tool: {invalid_tool}", cm.output
        )

        # Ensure that create_tools was called only with the valid CoreTool instances
        # (after callable is converted)
        self.assertTrue(mock_core_create_tools.called)
        args, _ = mock_core_create_tools.call_args
        passed_core_tools_list = args[0]
        self.assertEqual(
            len(passed_core_tools_list), 2
        )  # callable_tool (converted) and core_tool_instance
        self.assertTrue(all(isinstance(t, CoreTool) for t in passed_core_tools_list))

    @patch(
        f"{CoreUnifiedToolFactory.__module__}.{CoreUnifiedToolFactory.__name__}.create_tools"
    )
    def test_empty_tools_list(self, mock_core_create_tools: MagicMock):
        mock_core_create_tools.return_value = []
        result = _convert_tools_for_framework([], AgentFramework.LLAMA_INDEX)
        mock_core_create_tools.assert_called_once_with([], AgentFramework.LLAMA_INDEX)
        self.assertEqual(result, [])

    @patch(
        f"{CoreUnifiedToolFactory.__module__}.{CoreUnifiedToolFactory.__name__}.create_tools"
    )
    def test_string_tools_are_skipped(self, mock_core_create_tools: MagicMock):
        """Test that string tool names are skipped in conversion."""
        mock_core_create_tools.return_value = []

        tools_input = ["tool_name_1", self.core_tool_instance, "tool_name_2"]

        with self.assertLogs(
            "opencontractserver.llms.agents.agent_factory", level="DEBUG"
        ) as cm:
            _convert_tools_for_framework(tools_input, AgentFramework.PYDANTIC_AI)

        # Check that string tools generated debug messages
        self.assertIn(
            "Tool name 'tool_name_1' will be resolved by framework", str(cm.output)
        )
        self.assertIn(
            "Tool name 'tool_name_2' will be resolved by framework", str(cm.output)
        )

        # Only the CoreTool instance should be passed to create_tools
        args, _ = mock_core_create_tools.call_args
        passed_core_tools_list = args[0]
        self.assertEqual(len(passed_core_tools_list), 1)
        self.assertIs(passed_core_tools_list[0], self.core_tool_instance)
