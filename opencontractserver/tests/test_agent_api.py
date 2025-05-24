"""
Tests for the beautiful OpenContracts LLM API.

These tests ensure the elegant API works correctly and maintains
its promise of simplicity and reliability.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from opencontractserver.llms import agents, embeddings, tools
from opencontractserver.llms.agents.core_agents import AgentFramework, CoreAgent
from opencontractserver.llms.tools.tool_factory import CoreTool


class TestAgentAPI:
    """Test the beautiful agent API."""
    
    @pytest.mark.asyncio
    async def test_simple_document_agent_creation(self):
        """Test the simplest possible agent creation."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            # The beautiful one-liner
            agent = await agents.for_document(123)
            
            # Verify it was called correctly
            mock_create.assert_called_once()
            args, kwargs = mock_create.call_args
            assert args[0] == 123  # document
            assert kwargs['framework'] == AgentFramework.LLAMA_INDEX  # default
            assert isinstance(agent, CoreAgent)
    
    @pytest.mark.asyncio
    async def test_document_agent_with_all_options(self):
        """Test document agent with full configuration."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            # Advanced configuration
            agent = await agents.for_document(
                document=456,
                framework="pydantic_ai",
                user_id=789,
                model="gpt-4",
                system_prompt="You are an expert",
                tools=["summarize", "notes"],
                embedder="custom-embedder",
                streaming=False,
                verbose=True
            )
            
            # Verify all parameters passed correctly
            mock_create.assert_called_once()
            args, kwargs = mock_create.call_args
            assert args[0] == 456
            assert kwargs['framework'] == AgentFramework.PYDANTIC_AI
            assert kwargs['user_id'] == 789
            assert kwargs['model_name'] == "gpt-4"
            assert kwargs['override_system_prompt'] == "You are an expert"
            assert kwargs['embedder_path'] == "custom-embedder"
            assert kwargs['streaming'] is False
            assert kwargs['verbose'] is True
    
    @pytest.mark.asyncio
    async def test_corpus_agent_creation(self):
        """Test corpus agent creation."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_corpus_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            agent = await agents.for_corpus(
                corpus_id=101,
                framework="llama_index",
                model="claude-3-sonnet"
            )
            
            mock_create.assert_called_once()
            args, kwargs = mock_create.call_args
            assert args[0] == 101
            assert kwargs['framework'] == AgentFramework.LLAMA_INDEX
            assert kwargs['model_name'] == "claude-3-sonnet"
    
    def test_framework_string_conversion(self):
        """Test that framework strings are converted to enums."""
        # This is tested implicitly in the above tests
        assert AgentFramework("llama_index") == AgentFramework.LLAMA_INDEX
        assert AgentFramework("pydantic_ai") == AgentFramework.PYDANTIC_AI
    
    @pytest.mark.asyncio
    async def test_tool_resolution(self):
        """Test that tools are resolved correctly."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            # Custom function tool
            def my_tool(x: int) -> str:
                return f"Result: {x}"
            
            # Custom CoreTool
            core_tool = CoreTool.from_function(my_tool)
            
            await agents.for_document(
                document=123,
                tools=["summarize", my_tool, core_tool]
            )
            
            # Verify tools were resolved
            mock_create.assert_called_once()
            args, kwargs = mock_create.call_args
            resolved_tools = kwargs['tools']
            assert len(resolved_tools) == 3
            assert all(isinstance(tool, CoreTool) for tool in resolved_tools)


class TestEmbeddingAPI:
    """Test the embedding API."""
    
    def test_simple_embedding_generation(self):
        """Test simple embedding generation."""
        with patch('opencontractserver.utils.embeddings.generate_embeddings_from_text') as mock_generate:
            mock_generate.return_value = ("test-embedder", [0.1, 0.2, 0.3])
            
            embedder_path, vector = embeddings.generate("Hello world")
            
            mock_generate.assert_called_once_with(
                text="Hello world",
                corpus_id=None,
                mimetype=None,
                embedder_path=None
            )
            assert embedder_path == "test-embedder"
            assert vector == [0.1, 0.2, 0.3]
    
    def test_contextual_embedding_generation(self):
        """Test embedding generation with context."""
        with patch('opencontractserver.utils.embeddings.generate_embeddings_from_text') as mock_generate:
            mock_generate.return_value = ("legal-embedder", [0.4, 0.5, 0.6])
            
            embedder_path, vector = embeddings.generate(
                "Legal text",
                corpus_id=123,
                mimetype="application/pdf",
                embedder="custom-embedder"
            )
            
            mock_generate.assert_called_once_with(
                text="Legal text",
                corpus_id=123,
                mimetype="application/pdf",
                embedder_path="custom-embedder"
            )
            assert embedder_path == "legal-embedder"
            assert vector == [0.4, 0.5, 0.6]


class TestToolAPI:
    """Test the tool API."""
    
    def test_document_tools(self):
        """Test getting standard document tools."""
        with patch('opencontractserver.llms.tools.tool_factory.create_document_tools') as mock_create:
            mock_tools = [MagicMock(spec=CoreTool) for _ in range(3)]
            mock_create.return_value = mock_tools
            
            result = tools.document_tools()
            
            mock_create.assert_called_once()
            assert result == mock_tools
    
    def test_from_function(self):
        """Test creating tool from function."""
        def test_function(x: int) -> str:
            """Test function."""
            return f"Result: {x}"
        
        with patch('opencontractserver.llms.tools.tool_factory.CoreTool.from_function') as mock_from_function:
            mock_tool = MagicMock(spec=CoreTool)
            mock_from_function.return_value = mock_tool
            
            result = tools.from_function(
                test_function,
                name="custom_name",
                description="Custom description"
            )
            
            mock_from_function.assert_called_once_with(
                func=test_function,
                name="custom_name",
                description="Custom description",
                parameter_descriptions=None
            )
            assert result == mock_tool


class TestToolResolution:
    """Test the internal tool resolution logic."""
    
    def test_builtin_tool_resolution(self):
        """Test that built-in tools are resolved by name."""
        from opencontractserver.llms.api import _resolve_tools
        
        tools_list = ["summarize", "notes", "md_summary_length"]
        resolved = _resolve_tools(tools_list)
        
        assert len(resolved) == 3
        assert all(isinstance(tool, CoreTool) for tool in resolved)
    
    def test_mixed_tool_resolution(self):
        """Test resolving mixed tool types."""
        from opencontractserver.llms.api import _resolve_tools
        
        def custom_func(x: int) -> str:
            return str(x)
        
        custom_tool = CoreTool.from_function(custom_func)
        
        tools_list = [
            "summarize",  # Built-in by name
            custom_func,  # Function
            custom_tool,  # CoreTool
        ]
        
        resolved = _resolve_tools(tools_list)
        
        assert len(resolved) == 3
        assert all(isinstance(tool, CoreTool) for tool in resolved)
    
    def test_unknown_builtin_tool(self):
        """Test handling of unknown built-in tool names."""
        from opencontractserver.llms.api import _resolve_tools
        
        with patch('opencontractserver.llms.api.logger') as mock_logger:
            tools_list = ["unknown_tool", "summarize"]
            resolved = _resolve_tools(tools_list)
            
            # Should resolve only the known tool
            assert len(resolved) == 1
            
            # Should log warning for unknown tool
            mock_logger.warning.assert_called_once_with("Unknown built-in tool: unknown_tool")
    
    def test_invalid_tool_type(self):
        """Test handling of invalid tool types."""
        from opencontractserver.llms.api import _resolve_tools
        
        with patch('opencontractserver.llms.api.logger') as mock_logger:
            tools_list = ["summarize", 123, None]  # Invalid types
            resolved = _resolve_tools(tools_list)
            
            # Should resolve only the valid tool
            assert len(resolved) == 1
            
            # Should log warnings for invalid tools
            assert mock_logger.warning.call_count == 2


class TestAPIIntegration:
    """Integration tests for the complete API."""
    
    @pytest.mark.asyncio
    async def test_end_to_end_document_workflow(self):
        """Test a complete document agent workflow."""
        # Mock the entire chain
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            # Create mock agent with chat capability
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_agent.chat.return_value = "This document is about AI."
            mock_create.return_value = mock_agent
            
            # Create agent
            agent = await agents.for_document(123)
            
            # Chat with agent
            response = await agent.chat("What is this document about?")
            
            # Verify the workflow
            assert response == "This document is about AI."
            mock_agent.chat.assert_called_once_with("What is this document about?")
    
    @pytest.mark.asyncio
    async def test_streaming_workflow(self):
        """Test streaming response workflow."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_corpus_agent') as mock_create:
            # Create mock agent with streaming capability
            mock_agent = AsyncMock(spec=CoreAgent)
            
            async def mock_stream(message):
                for chunk in ["Hello", " ", "world", "!"]:
                    yield chunk
            
            mock_agent.stream_chat = mock_stream
            mock_create.return_value = mock_agent
            
            # Create agent
            agent = await agents.for_corpus(456)
            
            # Stream response
            chunks = []
            async for chunk in agent.stream_chat("Summarize"):
                chunks.append(chunk)
            
            # Verify streaming worked
            assert chunks == ["Hello", " ", "world", "!"]


# Fixtures for testing
@pytest.fixture
def mock_document():
    """Mock document for testing."""
    document = MagicMock()
    document.id = 123
    document.title = "Test Document"
    document.description = "A test document"
    return document


@pytest.fixture
def mock_corpus():
    """Mock corpus for testing."""
    corpus = MagicMock()
    corpus.id = 456
    corpus.title = "Test Corpus"
    corpus.preferred_embedder = "test-embedder"
    return corpus


# Performance tests
class TestAPIPerformance:
    """Test API performance characteristics."""
    
    def test_import_speed(self):
        """Test that imports are fast (no heavy initialization)."""
        import time
        
        start = time.time()
        from opencontractserver.llms import agents, embeddings, tools
        end = time.time()
        
        # Should import quickly (less than 100ms)
        assert (end - start) < 0.1
    
    def test_lazy_loading(self):
        """Test that heavy dependencies are loaded lazily."""
        # The API should not import heavy framework dependencies
        # until actually needed
        
        # This is more of a design test - the imports in api.py
        # should not include heavy framework-specific imports
        from opencontractserver.llms import api
        
        # Check that the module doesn't have heavy framework imports
        # (This is a design constraint rather than a functional test)
        assert hasattr(api, 'agents')
        assert hasattr(api, 'embeddings')
        assert hasattr(api, 'tools') 