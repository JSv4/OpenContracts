"""Tests for LlamaIndex agent implementations following modern patterns."""

import random
from typing import Optional, List
from unittest.mock import patch, MagicMock, AsyncMock

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings
from asgiref.sync import sync_to_async

from llama_index.core.tools.function_tool import FunctionTool
from llama_index.core.chat_engine.types import StreamingAgentChatResponse
from llama_index.core.base.llms.types import ChatMessage as LlamaChatMessage
from llama_index.core.schema import NodeWithScore, TextNode

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.conversations.models import Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.agent_factory import UnifiedAgentFactory
from opencontractserver.llms.agents.llama_index_agents import (
    LlamaIndexDocumentAgent,
    LlamaIndexCorpusAgent,
    _convert_llama_index_node_to_source_node,
)
from opencontractserver.llms.tools.tool_factory import CoreTool, create_document_tools
from opencontractserver.llms.tools.llama_index_tools import (
    load_document_md_summary_tool,
    get_md_summary_token_length_tool,
)
from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory
from opencontractserver.llms.vector_stores.llama_index_vector_stores import DjangoAnnotationVectorStore
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    UnifiedChatResponse,
    UnifiedStreamResponse,
    SourceNode,
)

User = get_user_model()


def random_vector(dimension: int = 384, seed: int = 42) -> list[float]:
    """Generate a random vector for testing."""
    rng = random.Random(seed)
    return [rng.random() for _ in range(dimension)]


def constant_vector(dimension: int = 384, value: float = 0.5) -> list[float]:
    """Generate a constant vector for testing."""
    return [value] * dimension


class MockStreamingResponse:
    """Mock streaming response for LlamaIndex."""
    
    def __init__(self, content: str, source_nodes: Optional[List] = None):
        self.content = content
        self.source_nodes = source_nodes or []
        self.response = content
        
    async def async_response_gen(self):
        """Simulate async token generation."""
        words = self.content.split()
        for word in words:
            yield word + " "


class MockAgentResponse:
    """Mock non-streaming response for LlamaIndex."""
    
    def __init__(self, content: str, source_nodes: Optional[List] = None):
        self.response = content
        self.source_nodes = source_nodes or []


class TestLlamaIndexAgents(TestCase):
    """Test suite for LlamaIndex agent implementations."""

    @classmethod
    def setUpTestData(cls) -> None:
        """Create test data following the vector store test patterns."""
        with transaction.atomic():
            cls.user = User.objects.create_user(
                username="testuser",
                password="testpass",
            )
            
            cls.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="A test corpus for agent testing",
                creator=cls.user,
                is_public=True,
            )
            
            cls.doc1 = Document.objects.create(
                title="Test Document 1",
                description="First test document",
                creator=cls.user,
                is_public=True,
            )
            
            cls.doc2 = Document.objects.create(
                title="Test Document 2", 
                description="Second test document",
                creator=cls.user,
                is_public=True,
            )
            
            # Add documents to corpus
            cls.corpus.documents.add(cls.doc1, cls.doc2)
            
            # Create annotation labels
            cls.label_important = AnnotationLabel.objects.create(
                text="Important Label",
                creator=cls.user,
            )
            
            cls.label_summary = AnnotationLabel.objects.create(
                text="Summary",
                creator=cls.user,
            )
            
            # Create annotations with text content
            cls.anno1 = Annotation.objects.create(
                document=cls.doc1,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="This is the first annotation text about important topics",
                annotation_label=cls.label_important,
                is_public=True,
            )
            
            cls.anno2 = Annotation.objects.create(
                document=cls.doc1,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="Another annotation in the same document about different topics",
                annotation_label=cls.label_summary,
                is_public=True,
            )
            
            cls.anno3 = Annotation.objects.create(
                document=cls.doc2,
                corpus=cls.corpus,
                creator=cls.user,
                raw_text="Annotation text for doc2, also marked as important",
                annotation_label=cls.label_important,
                is_public=True,
            )

        # Add embeddings to annotations
        embedder_path = "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder"
        cls.anno1.add_embedding(embedder_path, constant_vector(384, 0.1))
        cls.anno2.add_embedding(embedder_path, constant_vector(384, 0.2))
        cls.anno3.add_embedding(embedder_path, constant_vector(384, 0.3))

    def test_source_node_conversion(self) -> None:
        """Test converting LlamaIndex nodes to framework-agnostic SourceNode objects."""
        # Create a mock LlamaIndex node
        text_node = TextNode(
            text="Test annotation content",
            metadata={"annotation_id": 123, "document_id": 456},
            id_="test_node_id"
        )
        node_with_score = NodeWithScore(node=text_node, score=0.85)
        
        # Convert to SourceNode
        source_node = _convert_llama_index_node_to_source_node(node_with_score, 0.85)
        
        self.assertIsInstance(source_node, SourceNode)
        self.assertEqual(source_node.annotation_id, 123)
        self.assertEqual(source_node.content, "Test annotation content")
        self.assertEqual(source_node.similarity_score, 0.85)
        self.assertEqual(source_node.metadata["annotation_id"], 123)
        self.assertEqual(source_node.metadata["document_id"], 456)

    def test_source_node_conversion_string_annotation_id(self) -> None:
        """Test converting nodes with string annotation IDs."""
        text_node = TextNode(
            text="Test content",
            metadata={"annotation_id": "789"},
            id_="test_node_id"
        )
        
        source_node = _convert_llama_index_node_to_source_node(text_node)
        
        self.assertEqual(source_node.annotation_id, 789)  # Should be converted to int

    def test_source_node_conversion_fallback(self) -> None:
        """Test converting nodes without proper annotation ID."""
        text_node = TextNode(
            text="Test content",
            metadata={},
            id_="test_node_id"
        )
        
        source_node = _convert_llama_index_node_to_source_node(text_node)
        
        self.assertEqual(source_node.annotation_id, 0)  # Should fallback to 0

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_document_agent_creation(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test creating a LlamaIndex document agent."""
        # Mock the dependencies
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        
        mock_query_engine = MagicMock()
        mock_index_instance.as_query_engine.return_value = mock_query_engine
        
        mock_agent_instance = MagicMock()
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create configuration
        config = AgentConfig(
            user_id=self.user.id,
            model_name="gpt-4o-mini",
            api_key="test-key",
            system_prompt="You are a helpful document assistant.",
            temperature=0.7,
            max_tokens=1000,
        )
        
        # Create agent
        agent = await LlamaIndexDocumentAgent.create(
            document=self.doc1,
            config=config,
        )
        
        # Verify initialization
        self.assertIsInstance(agent, LlamaIndexDocumentAgent)
        self.assertEqual(agent.context.document, self.doc1)
        self.assertIsNotNone(agent.conversation_manager)
        
        # Verify LlamaIndex components were set up
        mock_vector_store.from_params.assert_called_once()
        mock_index.from_vector_store.assert_called_once_with(
            vector_store=mock_vector_store_instance, 
            use_async=False
        )
        mock_openai_agent.from_tools.assert_called_once()

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_document_agent_chat(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test document agent chat functionality."""
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        # Mock the OpenAI agent response
        mock_response = MockAgentResponse(
            "This document is about testing LlamaIndex agents.",
            source_nodes=[
                NodeWithScore(
                    node=TextNode(
                        text="Source content",
                        metadata={"annotation_id": self.anno1.id}
                    ),
                    score=0.9
                )
            ]
        )
        mock_agent_instance = MagicMock()
        mock_agent_instance.astream_chat = AsyncMock(return_value=mock_response)
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create and test agent
        config = AgentConfig(user_id=self.user.id, model_name="gpt-4o-mini")
        agent = await LlamaIndexDocumentAgent.create(self.doc1, config)
        
        response = await agent.chat("What is this document about?")
        
        # Verify response structure
        self.assertIsInstance(response, UnifiedChatResponse)
        self.assertEqual(response.content, "This document is about testing LlamaIndex agents.")
        self.assertGreater(len(response.sources), 0)
        self.assertEqual(response.sources[0].annotation_id, self.anno1.id)
        self.assertEqual(response.metadata["framework"], "llama_index")
        self.assertIsNotNone(response.user_message_id)
        self.assertIsNotNone(response.llm_message_id)

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_document_agent_streaming(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test document agent streaming functionality."""
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        # Mock streaming response
        mock_content = "This is a streaming response test"
        mock_source_nodes = [
            NodeWithScore(
                node=TextNode(
                    text="Streaming source",
                    metadata={"annotation_id": self.anno2.id}
                ),
                score=0.8
            )
        ]

        async def mock_async_gen():
            for word in mock_content.split():
                yield word + " "

        # Create a proper mock for StreamingAgentChatResponse
        mock_streaming_chat_response = MagicMock(spec=StreamingAgentChatResponse)
        mock_streaming_chat_response.async_response_gen = mock_async_gen
        mock_streaming_chat_response.source_nodes = mock_source_nodes
        mock_streaming_chat_response.response = mock_content

        mock_agent_instance = MagicMock()
        mock_agent_instance.astream_chat = AsyncMock(return_value=mock_streaming_chat_response)
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create and test agent
        config = AgentConfig(user_id=self.user.id, model_name="gpt-4o-mini", streaming=True)
        agent = await LlamaIndexDocumentAgent.create(self.doc1, config)
        
        # Collect streaming responses
        responses = []
        async for chunk in agent.stream("Tell me about this document"):
            responses.append(chunk)
            
        # Verify streaming behavior
        self.assertGreater(len(responses), 0)
        
        # Check intermediate responses
        for i, chunk in enumerate(responses[:-1]):
            self.assertIsInstance(chunk, UnifiedStreamResponse)
            self.assertFalse(chunk.is_complete)
            self.assertIsNotNone(chunk.accumulated_content)
            
        # Check final response
        final_chunk = responses[-1]
        self.assertTrue(final_chunk.is_complete)
        self.assertGreater(len(final_chunk.sources), 0)
        self.assertEqual(final_chunk.sources[0].annotation_id, self.anno2.id)

    @patch('opencontractserver.llms.agents.llama_index_agents.ObjectIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_corpus_agent_creation(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent, mock_object_index):
        """Test creating a LlamaIndex corpus agent."""
        # Mock dependencies
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        mock_object_index_instance = MagicMock()
        mock_object_index.from_objects.return_value = mock_object_index_instance
        mock_object_index_instance.as_retriever.return_value = MagicMock()
        
        mock_agent_instance = MagicMock()
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create configuration
        config = AgentConfig(
            user_id=self.user.id,
            model_name="gpt-4o-mini",
            api_key="test-key",
        )
        
        # Create corpus agent
        agent = await LlamaIndexCorpusAgent.create(
            corpus_id=self.corpus.id,
            config=config,
        )
        
        # Verify initialization
        self.assertIsInstance(agent, LlamaIndexCorpusAgent)
        self.assertEqual(agent.context.corpus, self.corpus)
        self.assertIsNotNone(agent.conversation_manager)
        
        # Verify corpus-specific setup
        mock_object_index.from_objects.assert_called_once()
        # mock_openai_agent.from_tools.assert_called_once() # Original failing line
        # Expect 1 call for each document + 1 for the aggregator agent
        # Use sync_to_async to safely access the ManyToMany relationship
        corpus_documents = await sync_to_async(list)(self.corpus.documents.all())
        expected_call_count = len(corpus_documents) + 1 
        self.assertEqual(mock_openai_agent.from_tools.call_count, expected_call_count)

    def test_llama_index_vector_store_creation(self) -> None:
        """Test creating LlamaIndex vector store through factory."""
        vector_store = UnifiedVectorStoreFactory.create_vector_store(
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id,
            document_id=self.doc1.id,
        )
        
        self.assertIsInstance(vector_store, DjangoAnnotationVectorStore)

    def test_llama_index_tools_integration(self) -> None:
        """Test LlamaIndex tool integration."""
        # Test that tools are FunctionTool instances
        self.assertIsInstance(load_document_md_summary_tool, FunctionTool)
        self.assertIsInstance(get_md_summary_token_length_tool, FunctionTool)
        
        # Test tool metadata
        self.assertIsNotNone(load_document_md_summary_tool.metadata.name)
        self.assertIsNotNone(load_document_md_summary_tool.metadata.description)

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_error_handling_in_chat(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test error handling in LlamaIndex agent chat."""
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        # Mock agent to raise an exception
        mock_agent_instance = MagicMock()
        mock_agent_instance.astream_chat = AsyncMock(side_effect=Exception("LLM error"))
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create agent
        config = AgentConfig(user_id=self.user.id, model_name="gpt-4o-mini")
        agent = await LlamaIndexDocumentAgent.create(self.doc1, config)
        
        # Test that exceptions are properly handled
        with self.assertRaises(Exception) as cm:
            await agent.chat("Test query")
        
        self.assertEqual(str(cm.exception), "LLM error")

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_message_storage_control(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test controlling message storage in LlamaIndex agents."""
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        mock_response = MockAgentResponse("Test response")
        mock_agent_instance = MagicMock()
        mock_agent_instance.astream_chat = AsyncMock(return_value=mock_response)
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create agent with message storage disabled
        config = AgentConfig(
            user_id=self.user.id,
            model_name="gpt-4o-mini",
            store_user_messages=False,
            store_llm_messages=False,
        )
        agent = await LlamaIndexDocumentAgent.create(self.doc1, config)
        
        # Test chat without message storage
        response = await agent.chat("Test query", store_messages=False)
        
        self.assertIsInstance(response, UnifiedChatResponse)
        self.assertIsNone(response.user_message_id)
        self.assertIsNone(response.llm_message_id)

    async def test_agent_factory_integration(self) -> None:
        """Test creating LlamaIndex agents through the unified factory."""
        # Test document agent creation
        agent = await UnifiedAgentFactory.create_document_agent(
            document=self.doc1,
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id,
        )
        
        # Verify we get a LlamaIndex agent
        self.assertIsInstance(agent, LlamaIndexDocumentAgent)
        
        # Test corpus agent creation
        corpus_agent = await UnifiedAgentFactory.create_corpus_agent(
            corpus_id=self.corpus.id,
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id,
        )
        
        self.assertIsInstance(corpus_agent, LlamaIndexCorpusAgent)

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_custom_tools_integration(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test integrating custom tools with LlamaIndex agents."""
        # Create a custom tool
        def custom_analysis_tool(query: str) -> str:
            """Custom tool for document analysis."""
            return f"Custom analysis for: {query}"
        
        custom_tool = FunctionTool.from_defaults(
            fn=custom_analysis_tool,
            name="custom_analysis",
            description="Performs custom analysis"
        )
        
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        mock_agent_instance = MagicMock()
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Create agent with custom tools
        config = AgentConfig(user_id=self.user.id, model_name="gpt-4o-mini")
        agent = await LlamaIndexDocumentAgent.create(
            document=self.doc1,
            config=config,
            tools=[custom_tool]
        )
        
        # Verify agent was created with tools
        self.assertIsInstance(agent, LlamaIndexDocumentAgent)
        
        # Verify that tools were passed to OpenAI agent
        call_args = mock_openai_agent.from_tools.call_args
        tools_passed = call_args[0][0]  # First positional argument
        
        # Should contain our custom tool plus the default tools
        self.assertGreater(len(tools_passed), 1)
        
        # Check that our custom tool is included
        tool_names = [getattr(tool, 'metadata', getattr(tool, '_metadata', None)) for tool in tools_passed]
        tool_names = [getattr(meta, 'name', None) if meta else None for meta in tool_names]
        self.assertIn('custom_analysis', tool_names)

    @patch('opencontractserver.llms.agents.llama_index_agents.OpenAIAgent')
    @patch('opencontractserver.llms.agents.llama_index_agents.VectorStoreIndex')
    @patch('opencontractserver.llms.agents.llama_index_agents.DjangoAnnotationVectorStore')
    @patch('opencontractserver.llms.agents.llama_index_agents.Settings')
    async def test_conversation_continuity(self, mock_settings, mock_vector_store, mock_index, mock_openai_agent):
        """Test conversation continuity in LlamaIndex agents."""
        # Set up mocks
        mock_vector_store_instance = MagicMock()
        mock_vector_store.from_params.return_value = mock_vector_store_instance
        
        mock_index_instance = MagicMock()
        mock_index.from_vector_store.return_value = mock_index_instance
        mock_index_instance.as_query_engine.return_value = MagicMock()
        
        mock_agent_instance = MagicMock()
        mock_openai_agent.from_tools.return_value = mock_agent_instance
        
        # Test that conversation history is passed to LlamaIndex agent
        from opencontractserver.conversations.models import Conversation, ChatMessage
        
        # Create a conversation with existing messages
        conversation = await Conversation.objects.acreate(
            title="Test Conversation",
            creator=self.user
        )
        
        user_msg = await ChatMessage.objects.acreate(
            conversation=conversation,
            content="Previous user message",
            msg_type="USER",
            creator=self.user
        )
        
        llm_msg = await ChatMessage.objects.acreate(
            conversation=conversation,
            content="Previous LLM response",
            msg_type="LLM",
            creator=self.user
        )
        
        # Create agent with existing conversation
        config = AgentConfig(
            user_id=self.user.id,
            model_name="gpt-4o-mini",
            conversation=conversation,
            loaded_messages=[user_msg, llm_msg]
        )
        
        agent = await LlamaIndexDocumentAgent.create(self.doc1, config)
        
        # Verify that chat history was passed to OpenAI agent
        call_kwargs = mock_openai_agent.from_tools.call_args[1]
        chat_history = call_kwargs.get('chat_history', [])
        
        # Should have system prompt + loaded messages
        self.assertGreater(len(chat_history), 2)
        
        # Check message types
        self.assertIsInstance(chat_history[0], LlamaChatMessage)
        self.assertEqual(chat_history[0].role, "system")

    def test_legacy_compatibility_interface(self) -> None:
        """Test backward compatibility with legacy OpenContractDbAgent interface."""
        from opencontractserver.llms.agents.llama_index_agents import OpenContractDbAgent
        from opencontractserver.llms.agents.core_agents import CoreAgent, CoreConversationManager
        
        # Create a mock CoreAgent
        mock_core_agent = MagicMock(spec=CoreAgent)
        
        # Setup the conversation_manager attribute on the mock_core_agent
        mock_core_agent.conversation_manager = MagicMock(spec=CoreConversationManager)
        mock_core_agent.conversation_manager.conversation = MagicMock(spec=Conversation) # If Conversation is a Django model
        mock_core_agent.conversation_manager.user_id = self.user.id
        
        # Create legacy wrapper
        legacy_agent = OpenContractDbAgent(mock_core_agent)
        
        # Test legacy interface methods exist
        self.assertTrue(hasattr(legacy_agent, 'astream_chat'))
        self.assertTrue(hasattr(legacy_agent, 'store_llm_message'))
        self.assertTrue(hasattr(legacy_agent, 'update_message'))
        self.assertEqual(legacy_agent.user_id, self.user.id)

    @override_settings(
        OPENAI_API_KEY="test-key",
    )
    def test_settings_configuration(self) -> None:
        """Test that LlamaIndex agents properly configure settings."""
        config = AgentConfig(
            user_id=self.user.id,
            model_name="gpt-4o-mini",
            api_key="test-key",
            temperature=0.5,
            max_tokens=2000,
        )
        
        # Test that configuration values are properly set
        self.assertEqual(config.model_name, "gpt-4o-mini")
        self.assertEqual(config.api_key, "test-key")
        self.assertEqual(config.temperature, 0.5)
        self.assertEqual(config.max_tokens, 2000)

    def test_node_conversion_edge_cases(self) -> None:
        """Test edge cases in LlamaIndex node conversion."""
        # Test node without metadata
        text_node = TextNode(text="Content without metadata")
        source_node = _convert_llama_index_node_to_source_node(text_node)
        
        self.assertEqual(source_node.annotation_id, 0)  # Should fallback
        self.assertEqual(source_node.content, "Content without metadata")
        
        # Test node with non-numeric annotation_id
        text_node_invalid = TextNode(
            text="Content with invalid ID",
            metadata={"annotation_id": "not_a_number"}
        )
        source_node_invalid = _convert_llama_index_node_to_source_node(text_node_invalid)
        
        self.assertEqual(source_node_invalid.annotation_id, 0)  # Should fallback
        
        # Test node with no text attribute
        mock_node = MagicMock()
        mock_node.metadata = {"annotation_id": 456}
        del mock_node.text  # Remove text attribute
        
        source_node_no_text = _convert_llama_index_node_to_source_node(mock_node)
        
        self.assertEqual(source_node_no_text.annotation_id, 456)
        self.assertEqual(source_node_no_text.content, "")  # Should default to empty string 