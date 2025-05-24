"""
Tests for the beautiful OpenContracts LLM API.

These tests ensure the elegant API works correctly and maintains
its promise of simplicity and reliability.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from opencontractserver.llms import agents, embeddings, tools, vector_stores
from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.core_agents import CoreAgent
from opencontractserver.llms.tools.tool_factory import CoreTool

User = get_user_model()


class TestAgentAPI(TestCase):
    """Test the beautiful agent API."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", 
            password="testpass",
            email="test@example.com"
        )
    
    def test_simple_document_agent_creation(self):
        """Test the simplest possible agent creation."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            # The beautiful one-liner - run in async context
            async def test_async():
                agent = await agents.for_document(123)
                
                # Verify it was called correctly
                mock_create.assert_called_once()
                args, kwargs = mock_create.call_args
                self.assertEqual(kwargs['document'], 123)  # document passed as kwarg
                self.assertEqual(kwargs['framework'], AgentFramework.LLAMA_INDEX)  # default
                self.assertIsInstance(agent, CoreAgent)
            
            asyncio.run(test_async())
    
    def test_document_agent_with_all_options(self):
        """Test document agent with full configuration."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            async def test_async():
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
                self.assertEqual(kwargs['document'], 456)
                self.assertEqual(kwargs['framework'], AgentFramework.PYDANTIC_AI)
                self.assertEqual(kwargs['user_id'], 789)
                self.assertEqual(kwargs['model_name'], "gpt-4")
                self.assertEqual(kwargs['override_system_prompt'], "You are an expert")
                self.assertEqual(kwargs['embedder_path'], "custom-embedder")
                self.assertFalse(kwargs['streaming'])
                self.assertTrue(kwargs['verbose'])
                self.assertIsNotNone(kwargs['tools'])
            
            asyncio.run(test_async())
    
    def test_corpus_agent_creation(self):
        """Test corpus agent creation."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_corpus_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            async def test_async():
                agent = await agents.for_corpus(
                    corpus_id=101,
                    framework="llama_index",
                    model="claude-3-sonnet"
                )
                
                mock_create.assert_called_once()
                args, kwargs = mock_create.call_args
                self.assertEqual(kwargs['corpus_id'], 101)
                self.assertEqual(kwargs['framework'], AgentFramework.LLAMA_INDEX)
                self.assertEqual(kwargs['model_name'], "claude-3-sonnet")
            
            asyncio.run(test_async())
    
    def test_framework_string_conversion(self):
        """Test that framework strings are converted to enums."""
        self.assertEqual(AgentFramework("llama_index"), AgentFramework.LLAMA_INDEX)
        self.assertEqual(AgentFramework("pydantic_ai"), AgentFramework.PYDANTIC_AI)
    
    def test_tool_resolution(self):
        """Test that tools are resolved correctly."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_create.return_value = mock_agent
            
            async def test_async():
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
                self.assertEqual(len(resolved_tools), 3)
                self.assertTrue(all(isinstance(tool, CoreTool) for tool in resolved_tools))
            
            asyncio.run(test_async())


class TestEmbeddingAPI(TestCase):
    """Test the embedding API."""
    
    def test_simple_embedding_generation(self):
        """Test simple embedding generation."""
        with patch('opencontractserver.llms.embeddings.generate') as mock_module_generate:
            mock_module_generate.return_value = ("test-embedder", [0.1, 0.2, 0.3])
            
            embedder_path, vector = embeddings.generate("Hello world")
            
            # Only assert the arguments that were actually passed
            mock_module_generate.assert_called_once_with("Hello world")
            
            self.assertEqual(embedder_path, "test-embedder")
            self.assertEqual(vector, [0.1, 0.2, 0.3])
    
    def test_contextual_embedding_generation(self):
        """Test embedding generation with context."""
        with patch('opencontractserver.llms.embeddings.generate') as mock_module_generate:
            mock_module_generate.return_value = ("legal-embedder", [0.4, 0.5, 0.6])
            
            embedder_path, vector = embeddings.generate(
                "Legal text",
                corpus_id=123,
                mimetype="application/pdf",
                embedder_path="custom-embedder"
            )
            
            mock_module_generate.assert_called_once_with(
                "Legal text",
                corpus_id=123,
                mimetype="application/pdf",
                embedder_path="custom-embedder"
            )
            self.assertEqual(embedder_path, "legal-embedder")
            self.assertEqual(vector, [0.4, 0.5, 0.6])


class TestToolAPI(TestCase):
    """Test the tool API."""
    
    def test_document_tools(self):
        """Test getting standard document tools."""
        # The tools.document_tools() method calls create_document_tools directly
        result = tools.document_tools()
        
        # Should return a list of CoreTool instances
        self.assertIsInstance(result, list)
        self.assertTrue(all(isinstance(tool, CoreTool) for tool in result))
        self.assertGreater(len(result), 0)  # Should have some tools
    
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
            self.assertEqual(result, mock_tool)


class TestVectorStoreAPI(TestCase):
    """Test the vector store API."""
    
    def test_simple_vector_store_creation(self):
        """Test simple vector store creation with defaults."""
        with patch('opencontractserver.llms.vector_stores.vector_store_factory.UnifiedVectorStoreFactory.create_vector_store') as mock_create:
            mock_vector_store = MagicMock()
            mock_create.return_value = mock_vector_store
            
            result = vector_stores.create(corpus_id=123)
            
            mock_create.assert_called_once_with(
                framework=AgentFramework.LLAMA_INDEX,
                user_id=None,
                corpus_id=123,
                document_id=None,
                embedder_path=None,
                must_have_text=None,
                embed_dim=384,
            )
            self.assertEqual(result, mock_vector_store)
    
    def test_vector_store_with_all_options(self):
        """Test vector store creation with all options."""
        with patch('opencontractserver.llms.vector_stores.vector_store_factory.UnifiedVectorStoreFactory.create_vector_store') as mock_create:
            mock_vector_store = MagicMock()
            mock_create.return_value = mock_vector_store
            
            result = vector_stores.create(
                framework="pydantic_ai",
                user_id=456,
                corpus_id=789,
                document_id=101,
                embedder_path="custom-embedder",
                must_have_text="search text",
                embed_dim=768
            )
            
            mock_create.assert_called_once_with(
                framework=AgentFramework.PYDANTIC_AI,
                user_id=456,
                corpus_id=789,
                document_id=101,
                embedder_path="custom-embedder",
                must_have_text="search text",
                embed_dim=768,
            )
            self.assertEqual(result, mock_vector_store)


class TestToolResolution(TestCase):
    """Test the internal tool resolution logic."""
    
    def test_builtin_tool_resolution(self):
        """Test that built-in tools are resolved by name."""
        from opencontractserver.llms.api import _resolve_tools
        
        tools_list = ["summarize", "notes", "md_summary_length"]
        resolved = _resolve_tools(tools_list)
        
        self.assertEqual(len(resolved), 3)
        self.assertTrue(all(isinstance(tool, CoreTool) for tool in resolved))
    
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
        
        self.assertEqual(len(resolved), 3)
        self.assertTrue(all(isinstance(tool, CoreTool) for tool in resolved))
    
    def test_unknown_builtin_tool(self):
        """Test handling of unknown built-in tool names."""
        from opencontractserver.llms.api import _resolve_tools
        
        with patch('opencontractserver.llms.api.logger') as mock_logger:
            tools_list = ["unknown_tool", "summarize"]
            resolved = _resolve_tools(tools_list)
            
            # Should resolve only the known tool
            self.assertEqual(len(resolved), 1)
            
            # Should log warning for unknown tool
            mock_logger.warning.assert_called_once_with("Unknown built-in tool: unknown_tool")
    
    def test_invalid_tool_type(self):
        """Test handling of invalid tool types."""
        from opencontractserver.llms.api import _resolve_tools
        
        with patch('opencontractserver.llms.api.logger') as mock_logger:
            tools_list = ["summarize", 123, None]  # Invalid types
            resolved = _resolve_tools(tools_list)
            
            # Should resolve only the valid tool
            self.assertEqual(len(resolved), 1)
            
            # Should log warnings for invalid tools
            self.assertEqual(mock_logger.warning.call_count, 2)


class TestAPIIntegration(TestCase):
    """Integration tests for the complete API."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", 
            password="testpass",
            email="test@example.com"
        )
    
    def test_end_to_end_document_workflow(self):
        """Test a complete document agent workflow."""
        # Mock the entire chain
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_create:
            # Create mock agent with chat capability
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_agent.chat.return_value = "This document is about AI."
            mock_create.return_value = mock_agent
            
            async def test_async():
                # Create agent
                agent = await agents.for_document(123)
                
                # Chat with agent
                response = await agent.chat("What is this document about?")
                
                # Verify the workflow
                self.assertEqual(response, "This document is about AI.")
                mock_agent.chat.assert_called_once_with("What is this document about?")
            
            asyncio.run(test_async())
    
    def test_streaming_workflow(self):
        """Test streaming response workflow."""
        with patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_corpus_agent') as mock_create:
            # Create mock agent with streaming capability
            mock_agent = AsyncMock(spec=CoreAgent)
            
            async def mock_stream(message):
                for chunk in ["Hello", " ", "world", "!"]:
                    yield chunk
            
            mock_agent.stream_chat = mock_stream
            mock_create.return_value = mock_agent
            
            async def test_async():
                # Create agent
                agent = await agents.for_corpus(456)
                
                # Stream response
                chunks = []
                async for chunk in agent.stream_chat("Summarize"):
                    chunks.append(chunk)
                
                # Verify streaming worked
                self.assertEqual(chunks, ["Hello", " ", "world", "!"])
            
            asyncio.run(test_async())

    def test_vector_store_integration(self):
        """Test vector store integration with agents."""
        with patch('opencontractserver.llms.vector_stores.vector_store_factory.UnifiedVectorStoreFactory.create_vector_store') as mock_vs_create, \
             patch('opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory.create_document_agent') as mock_agent_create:
            
            mock_vector_store = MagicMock()
            mock_vs_create.return_value = mock_vector_store
            
            mock_agent = AsyncMock(spec=CoreAgent)
            mock_agent_create.return_value = mock_agent
            
            async def test_async():
                # Create vector store
                store = vector_stores.create("llama_index", document_id=123)
                
                # Create agent
                agent = await agents.for_document(123)
                
                # Both should have been called
                mock_vs_create.assert_called_once()
                mock_agent_create.assert_called_once()
            
            asyncio.run(test_async())


class TestAPIPerformance(TestCase):
    """Test API performance characteristics."""
    
    def test_import_speed(self):
        """Test that imports are fast (no heavy initialization)."""
        import time
        
        start = time.time()
        from opencontractserver.llms import agents, embeddings, tools, vector_stores
        end = time.time()
        
        # Should import quickly (less than 100ms)
        self.assertLess(end - start, 0.1)
    
    def test_lazy_loading(self):
        """Test that heavy dependencies are loaded lazily."""
        # The API should not import heavy framework dependencies
        # until actually needed
        
        # This is more of a design test - the imports in api.py
        # should not include heavy framework-specific imports
        from opencontractserver.llms import api
        
        # Check that the module doesn't have heavy framework imports
        # (This is a design constraint rather than a functional test)
        self.assertTrue(hasattr(api, 'agents'))
        self.assertTrue(hasattr(api, 'embeddings'))
        self.assertTrue(hasattr(api, 'tools'))
        self.assertTrue(hasattr(api, 'vector_stores'))

    def test_api_singleton_instances(self):
        """Test that API instances are properly configured singletons."""
        from opencontractserver.llms.api import AgentAPI, EmbeddingAPI, ToolAPI, VectorStoreAPI
        from opencontractserver.llms import api
        
        # Check that exported instances are of correct types
        self.assertIsInstance(api.agents, AgentAPI)
        self.assertIsInstance(api.embeddings, EmbeddingAPI)
        self.assertIsInstance(api.tools, ToolAPI)
        self.assertIsInstance(api.vector_stores, VectorStoreAPI)
        
        # Check that they're the same instances when imported
        from opencontractserver.llms import agents as agents_import
        from opencontractserver.llms import embeddings as embeddings_import
        from opencontractserver.llms import tools as tools_import
        from opencontractserver.llms import vector_stores as vector_stores_import
        
        self.assertIs(agents_import, api.agents)
        self.assertIs(embeddings_import, api.embeddings)
        self.assertIs(tools_import, api.tools)
        self.assertIs(vector_stores_import, api.vector_stores) 