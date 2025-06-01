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
from opencontractserver.llms.tools.tool_factory import CoreTool
from opencontractserver.llms.tools.tool_factory import (
    UnifiedToolFactory as CoreUnifiedToolFactory,  # Alias to avoid confusion
)
from opencontractserver.llms.types import AgentFramework

# Mock framework-specific agent classes and tool factories
# These would normally be in their respective modules
# For testing, we define simplified mocks here or assume they exist and can be patched.

# Example: Mock LlamaIndexDocumentAgent
# Using strings for now, adjust if these modules/classes don't exist at these paths.
MOCK_LLAMA_INDEX_DOC_AGENT_PATH = (
    "opencontractserver.llms.agents.llama_index_agents.LlamaIndexDocumentAgent"
)
MOCK_PYDANTIC_AI_DOC_AGENT_PATH = (
    "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIDocumentAgent"
)
MOCK_LLAMA_INDEX_CORPUS_AGENT_PATH = (
    "opencontractserver.llms.agents.llama_index_agents.LlamaIndexCorpusAgent"
)
MOCK_PYDANTIC_AI_CORPUS_AGENT_PATH = (
    "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAICorpusAgent"
)

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

    # To make these tests pass, the mocked paths must exist or be created as mocks.
    # We'll assume for now they are patchable.
    @patch(
        MOCK_LLAMA_INDEX_DOC_AGENT_PATH, new_callable=MagicMock
    )  # Using MagicMock for .create if it's a classmethod
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    async def test_create_document_agent_llama_index(
        self, mock_get_config: MagicMock, MockLlamaDocAgent: MagicMock
    ):
        mock_config = AgentConfig(user_id=self.user.id)
        mock_get_config.return_value = mock_config
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        MockLlamaDocAgent.create = AsyncMock(
            return_value=mock_agent_instance
        )  # Mock the create classmethod

        agent = await UnifiedAgentFactory.create_document_agent(
            document=self.doc1,
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id,
            model_name="test_model",
        )

        mock_get_config.assert_called_once_with(
            user_id=self.user.id,
            system_prompt=None,
            conversation=None,
            loaded_messages=None,
            embedder_path=None,
            model_name="test_model",
        )
        MockLlamaDocAgent.create.assert_called_once_with(
            self.doc1, mock_config, []
        )  # Assumes no tools passed
        self.assertIs(agent, mock_agent_instance)

    @patch(MOCK_PYDANTIC_AI_DOC_AGENT_PATH, new_callable=MagicMock)
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    @patch(f"{UnifiedAgentFactory.__module__}._convert_tools_for_framework")
    async def test_create_document_agent_pydantic_ai_with_tools(
        self,
        mock_convert_tools: MagicMock,
        mock_get_config: MagicMock,
        MockPydanticDocAgent: MagicMock,
    ):
        mock_config = AgentConfig()
        mock_get_config.return_value = mock_config
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        MockPydanticDocAgent.create = AsyncMock(return_value=mock_agent_instance)

        raw_tools = [self.callable_tool]
        converted_framework_tools = [MagicMock()]  # Mocked converted tools
        mock_convert_tools.return_value = converted_framework_tools

        agent = await UnifiedAgentFactory.create_document_agent(
            document=self.doc1, framework=AgentFramework.PYDANTIC_AI, tools=raw_tools
        )

        mock_get_config.assert_called_once_with(
            user_id=None,
            system_prompt=None,
            conversation=None,
            loaded_messages=None,
            embedder_path=None,
        )
        mock_convert_tools.assert_called_once_with(
            raw_tools, AgentFramework.PYDANTIC_AI
        )
        MockPydanticDocAgent.create.assert_called_once_with(
            self.doc1, mock_config, converted_framework_tools
        )
        self.assertIs(agent, mock_agent_instance)

    @patch(MOCK_LLAMA_INDEX_CORPUS_AGENT_PATH, new_callable=MagicMock)
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    async def test_create_corpus_agent_llama_index(
        self, mock_get_config: MagicMock, MockLlamaCorpusAgent: MagicMock
    ):
        mock_config = AgentConfig()
        mock_get_config.return_value = mock_config
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        MockLlamaCorpusAgent.create = AsyncMock(return_value=mock_agent_instance)

        agent = await UnifiedAgentFactory.create_corpus_agent(
            corpus_id=self.corpus1.id, framework=AgentFramework.LLAMA_INDEX
        )
        mock_get_config.assert_called_once()
        MockLlamaCorpusAgent.create.assert_called_once_with(
            self.corpus1.id, mock_config, []
        )
        self.assertIs(agent, mock_agent_instance)

    @patch(MOCK_PYDANTIC_AI_CORPUS_AGENT_PATH, new_callable=MagicMock)
    @patch(f"{UnifiedAgentFactory.__module__}.get_default_config")
    async def test_create_corpus_agent_pydantic_ai(
        self, mock_get_config: MagicMock, MockPydanticCorpusAgent: MagicMock
    ):
        mock_config = AgentConfig()
        mock_get_config.return_value = mock_config
        mock_agent_instance = AsyncMock(spec=CoreAgent)
        MockPydanticCorpusAgent.create = AsyncMock(return_value=mock_agent_instance)

        agent = await UnifiedAgentFactory.create_corpus_agent(
            corpus_id=self.corpus1.id, framework=AgentFramework.PYDANTIC_AI
        )
        mock_get_config.assert_called_once()
        MockPydanticCorpusAgent.create.assert_called_once_with(
            self.corpus1.id, mock_config, []
        )
        self.assertIs(agent, mock_agent_instance)

    async def test_unsupported_framework_raises_error(self):
        with self.assertRaises(ValueError):
            await UnifiedAgentFactory.create_document_agent(
                self.doc1, framework="invalid_framework_name"
            )
        with self.assertRaises(ValueError):
            await UnifiedAgentFactory.create_corpus_agent(
                self.corpus1.id, framework="invalid_framework_name"
            )


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
    def test_none_tools_list(self, mock_core_create_tools: MagicMock):
        # Though the factory methods guard against None tools, _convert_tools_for_framework might be called with None
        # if the guard is in the public factory method. Let's assume it might receive it.
        # The current _convert_tools_for_framework loops, so None would error. It expects a list.
        # If tools is None, it should probably return [] or handle it gracefully.
        # Current implementation: `for tool in tools:` will raise TypeError if tools is None.
        # For now, this test assumes tools is always a list as per type hint.
        # If it needs to handle None, the function should be updated.
        pass


# Note on MOCK_..._AGENT_PATH: These paths assume a certain structure for your agent implementations.
# If your LlamaIndexDocumentAgent is, for example, directly in opencontractserver.llms.agents, the path would change.
# You'll need to adjust these string paths to where the actual classes are defined so patching works correctly.
# If these classes don't exist yet, these tests will fail at the patching stage.
# You might need to create placeholder classes/modules for these paths to be valid for patching during tests.
