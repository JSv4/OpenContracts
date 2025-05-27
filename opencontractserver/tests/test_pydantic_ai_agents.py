"""Tests for PydanticAI agent implementations following modern patterns."""

import random
from typing import Optional
from unittest.mock import patch, MagicMock, AsyncMock
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase, override_settings

from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.test import TestModel

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.types import AgentFramework
from opencontractserver.llms.agents.agent_factory import UnifiedAgentFactory
from opencontractserver.llms.agents.pydantic_ai_agents import (
    PydanticAIDocumentAgent,
)
from opencontractserver.llms.tools.tool_factory import CoreTool, create_document_tools
from opencontractserver.llms.tools.pydantic_ai_tools import (
    PydanticAIToolWrapper,
    PydanticAIDependencies,
    PydanticAIToolFactory,
)
from opencontractserver.llms.vector_stores.vector_store_factory import UnifiedVectorStoreFactory
from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import (
    PydanticAIAnnotationVectorStore,
    PydanticAIVectorSearchRequest,
)
from opencontractserver.llms.agents.core_agents import (
    UnifiedChatResponse,
)

User = get_user_model()


def random_vector(dimension: int = 384, seed: int = 42) -> list[float]:
    """Generate a random vector for testing."""
    rng = random.Random(seed)
    return [rng.random() for _ in range(dimension)]


def constant_vector(dimension: int = 384, value: float = 0.5) -> list[float]:
    """Generate a constant vector for testing."""
    return [value] * dimension


@dataclass
class TestDependencies:
    """Test dependencies for PydanticAI agents."""
    
    user_id: int
    document_id: Optional[int] = None
    corpus_id: Optional[int] = None
    api_key: str = "test-key"


class UserProfile(BaseModel):
    """Test structured output model."""
    
    name: str
    interests: list[str]


class _DummyRunResult:
    """Mock run result for testing."""
    
    def __init__(self, data: str):
        self.data = data
        self.sources = []

    def usage(self):
        return None


class _DummyStreamResult:
    """Mock stream result for testing."""
    
    def __init__(self, data: str):
        self.data = data
        self.sources = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def stream_text(self, delta: bool = True):
        for ch in self.data:
            yield ch

    def usage(self):
        return None


class TestPydanticAIAgents(TestCase):
    """Test suite for PydanticAI agent implementations."""

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

    def setUp(self) -> None:
        """Set up test case."""
        self.test_deps = TestDependencies(
            user_id=self.user.id,
            document_id=self.doc1.id,
            corpus_id=self.corpus.id,
        )

    @patch('opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent')
    def test_pydantic_ai_document_agent_creation(
        self,
        mock_pyd_ai_cls: MagicMock,
    ) -> None:
        """Ensure we can build a document agent with mocked internals."""
        # Produce the mock `PydanticAIAgent` instance
        mock_pyd_ai_instance = MagicMock()
        mock_pyd_ai_cls.return_value = mock_pyd_ai_instance

        # Fake context & conversation-manager
        from opencontractserver.llms.agents.core_agents import (
            AgentConfig,
            DocumentAgentContext,
            CoreConversationManager,
        )

        cfg = MagicMock(spec=AgentConfig)
        cfg.store_user_messages = True
        cfg.store_llm_messages = True

        mock_ctx = MagicMock(spec=DocumentAgentContext)
        mock_ctx.document = self.doc1
        mock_ctx.config = cfg

        mock_conv_mgr = MagicMock(spec=CoreConversationManager)

        # Build the agent
        agent = PydanticAIDocumentAgent(
            context=mock_ctx,
            conversation_manager=mock_conv_mgr,
            pydantic_ai_agent=mock_pyd_ai_instance,
            agent_deps=MagicMock(),  # dependencies object
        )

        # Basic sanity checks
        self.assertIs(agent.context, mock_ctx)
        self.assertIs(agent.conversation_manager, mock_conv_mgr)
        self.assertIs(agent.pydantic_ai_agent, mock_pyd_ai_instance)

    @patch('opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent')
    def test_pydantic_ai_agent_with_test_model(self, mock_agent_class: MagicMock) -> None:
        """Test PydanticAI agent using TestModel for testing."""
        # Create a real PydanticAI agent with TestModel for testing
        test_agent = Agent(
            model=TestModel(),
            deps_type=TestDependencies,
            system_prompt="You are a helpful assistant.",
        )
        
        # Test basic functionality
        with test_agent.override(deps=self.test_deps):
            result = test_agent.run_sync("Hello, how are you?")
            self.assertIsInstance(result.data, str)
            self.assertTrue(len(result.data) > 0)

    def test_pydantic_ai_tool_wrapper_creation(self) -> None:
        """Test PydanticAIToolWrapper creation and factory behavior."""
        from opencontractserver.llms.tools.core_tools import get_md_summary_token_length # Assuming this function exists
        
        core_tool = CoreTool.from_function(get_md_summary_token_length)
        
        # Instantiate the wrapper directly
        wrapper = PydanticAIToolWrapper(core_tool)

        # --- Assertions for the PydanticAIToolWrapper instance ---
        # Check name: assuming func.__name__ is used and is "get_md_summary_token_length"
        self.assertEqual(wrapper.name, "get_md_summary_token_length", 
                         f"Wrapper name mismatch. Expected 'get_md_summary_token_length', got '{wrapper.name}'")
        
        # Check description: assuming it exists and contains specific text
        self.assertIsNotNone(wrapper.description, "Tool description should not be None.")
        # This assertion implies 'get_md_summary_token_length' has a docstring containing "token length"
        self.assertIn("token length", wrapper.description.lower(), 
                      "Tool description does not contain expected text 'token length'.")

        # Check the to_dict() method of the wrapper
        tool_dict = wrapper.to_dict()
        expected_keys = {"function", "name", "description"}
        self.assertSetEqual(set(tool_dict.keys()), expected_keys,
                            f"wrapper.to_dict() keys mismatch. Expected {expected_keys}, got {set(tool_dict.keys())}")

        # --- Assertions for the PydanticAIToolFactory ---
        # Factory should return a callable function
        callable_tool = PydanticAIToolFactory.create_tool(core_tool)
        self.assertTrue(callable(callable_tool), 
                        "PydanticAIToolFactory.create_tool() should return a callable function.")

        # The callable function's signature should start with 'ctx'
        import inspect
        sig = inspect.signature(callable_tool)
        try:
            first_param_name = next(iter(sig.parameters.keys()))
            self.assertEqual(first_param_name, "ctx",
                             f"First parameter of the callable tool should be 'ctx', got '{first_param_name}'.")
        except StopIteration:
            self.fail("Callable tool has no parameters, expected 'ctx' as the first.")

    @patch('opencontractserver.llms.tools.core_tools.Document.objects.get')
    async def test_pydantic_ai_tool_with_agent(self, mock_doc_get: MagicMock) -> None:
        """Test PydanticAI tools working with an agent."""
        # Mock document retrieval
        mock_doc = MagicMock()
        mock_doc.md_summary_file.open.return_value.__enter__.return_value.read.return_value = "Test document content"
        mock_doc_get.return_value = mock_doc
        
        # Create agent with tools
        from opencontractserver.llms.tools.core_tools import load_document_md_summary
        
        async def mock_load_summary(
            ctx: RunContext[TestDependencies],
            document_id: int,
            truncate_length: Optional[int] = None,
            from_start: bool = True,
        ) -> str:
            """Mock document loading tool."""
            return f"Mock summary for document {document_id}"
        
        agent = Agent(
            model=TestModel(),
            deps_type=TestDependencies,
            tools=[mock_load_summary],
        )
        
        with agent.override(deps=self.test_deps):
            result = await agent.run(f"Load summary for document {self.doc1.id}")
            
            self.assertIsInstance(result.data, str)
            # TestModel should call the tool
            self.assertIn("Mock summary", result.data)

    def test_pydantic_ai_vector_store_creation(self) -> None:
        """Test creating PydanticAI vector store through factory."""
        vector_store = UnifiedVectorStoreFactory.create_vector_store(
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            corpus_id=self.corpus.id,
        )
        
        self.assertIsInstance(vector_store, PydanticAIAnnotationVectorStore)
        self.assertEqual(vector_store.user_id, self.user.id)
        self.assertEqual(vector_store.corpus_id, self.corpus.id)

    async def test_pydantic_ai_vector_store_search(self) -> None:
        """Test vector search functionality with PydanticAI vector store."""
        vector_store = PydanticAIAnnotationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
        )
        
        # Test search with query text
        response = await vector_store.search_annotations(
            query_text="important topics",
            similarity_top_k=5,
        )
        
        self.assertGreater(response.total_results, 0)
        self.assertIsInstance(response.results, list)
        
        # Check result structure
        if response.results:
            result = response.results[0]
            self.assertIn('annotation_id', result)
            self.assertIn('content', result)
            self.assertIn('similarity_score', result)

    async def test_pydantic_ai_vector_search_tool_creation(self) -> None:
        """Test creating vector search tools for PydanticAI agents."""
        from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import create_vector_search_tool
        
        # Create vector search tool
        search_tool = await create_vector_search_tool(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
        )
        
        self.assertTrue(callable(search_tool))
        
        # Test tool signature
        import inspect
        sig = inspect.signature(search_tool)
        params = list(sig.parameters.keys())
        
        self.assertIn('ctx', params)
        self.assertIn('query_text', params)

    @patch('opencontractserver.llms.vector_stores.core_vector_stores.generate_embeddings_from_text')
    async def test_pydantic_ai_agent_with_vector_search_tool(self, mock_gen_embeds: MagicMock) -> None:
        """Test PydanticAI agent using vector search tools."""
        # Mock embedding generation
        mock_gen_embeds.return_value = (
            "test_embedder",
            constant_vector(384, 0.15)
        )
        
        # Create vector search tool
        async def vector_search_tool(
            ctx: RunContext[TestDependencies],
            query_text: str,
            similarity_top_k: int = 5,
        ) -> str:
            """Mock vector search tool for testing."""
            # Simulate search results
            return f"Found {similarity_top_k} results for query: {query_text}"
        
        # Create agent with vector search capability
        agent = Agent(
            model=TestModel(),
            deps_type=TestDependencies,
            tools=[vector_search_tool],
            system_prompt="You are a document search assistant. Use vector search to find relevant information.",
        )
        
        with agent.override(deps=self.test_deps):
            result = await agent.run("Search for documents about important topics")
            
            self.assertIsInstance(result.data, str)
            # Should contain search results
            self.assertIn("Found", result.data)

    def test_pydantic_ai_structured_output(self) -> None:
        """Test PydanticAI agents with structured outputs."""
        # Create agent that returns structured data
        agent = Agent(
            model=TestModel(),
            result_type=UserProfile,
            system_prompt="Extract user profile information.",
        )
        
        result = agent.run_sync("My name is John and I like reading and coding")
        
        self.assertIsInstance(result.data, UserProfile)
        self.assertIsInstance(result.data.name, str)
        self.assertIsInstance(result.data.interests, list)

    @patch('opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent')
    async def test_pydantic_ai_error_handling(
        self,
        mock_pyd_ai_cls: MagicMock,
    ) -> None:
        """`chat` and `stream` should succeed even if the LLM is mocked."""
        # Configure mock agent
        mock_llm = MagicMock()
        mock_llm.run = AsyncMock(
            return_value=_DummyRunResult('PydanticAI Placeholder'),
        )
        mock_llm.run_stream = MagicMock(
            return_value=_DummyStreamResult('PydanticAI Placeholder'),
        )
        mock_pyd_ai_cls.return_value = mock_llm

        # Build minimal context & manager
        from opencontractserver.llms.agents.core_agents import (
            AgentConfig,
            DocumentAgentContext,
            CoreConversationManager,
        )

        cfg = MagicMock(spec=AgentConfig)
        cfg.store_user_messages = cfg.store_llm_messages = True
        cfg.user_id = self.user.id

        ctx = MagicMock(spec=DocumentAgentContext)
        ctx.document = self.doc1
        ctx.config = cfg

        conv_mgr = MagicMock(spec=CoreConversationManager)
        conv_mgr.get_conversation_messages = AsyncMock(return_value=[])

        agent = PydanticAIDocumentAgent(
            context=ctx,
            conversation_manager=conv_mgr,
            pydantic_ai_agent=mock_llm,
            agent_deps=MagicMock(),
        )

        # Patch I/O helpers to avoid touching the DB
        agent.store_user_message = AsyncMock(return_value='user-1')
        agent.store_llm_message = AsyncMock(return_value='llm-1')
        agent.update_message = AsyncMock()

        # Chat
        chat_resp = await agent.chat('test')
        self.assertIsInstance(chat_resp, UnifiedChatResponse)
        self.assertIn('PydanticAI Placeholder', chat_resp.content)

        # Stream
        streamed = [chunk async for chunk in agent.stream('test')]
        self.assertTrue(any(c.is_complete for c in streamed))

    @patch('opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent')
    async def test_pydantic_ai_agent_factory_integration(
        self,
        mock_pyd_ai_cls: MagicMock,
    ) -> None:
        """UnifiedAgentFactory should return a working PydanticAI agent."""
        # Mock LLM behaviour
        dummy = MagicMock()
        dummy.run = AsyncMock(return_value=_DummyRunResult('PydanticAI Placeholder'))
        mock_pyd_ai_cls.return_value = dummy

        # Build agent via factory
        agent = await UnifiedAgentFactory.create_document_agent(
            self.doc1,
            self.corpus,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
        )
        self.assertIsInstance(agent, PydanticAIDocumentAgent)

        # Monkey-patch message helpers
        agent.store_user_message = AsyncMock(return_value='u-id')
        agent.store_llm_message = AsyncMock(return_value='l-id')
        agent.update_message = AsyncMock()
        agent.conversation_manager.get_conversation_messages = AsyncMock(
            return_value=[],
        )

        # Verify `chat`
        resp = await agent.chat('What is this document about?')
        self.assertIsInstance(resp, UnifiedChatResponse)
        self.assertIn('PydanticAI Placeholder', resp.content)

    @override_settings(
        OPENAI_API_KEY="test-key",
        ANTHROPIC_API_KEY="test-key",
    )
    def test_pydantic_ai_dependencies_injection(self) -> None:
        """Test dependency injection with PydanticAI agents."""
        # Create agent with dependencies
        agent = Agent(
            model=TestModel(),
            deps_type=TestDependencies,
            system_prompt="You have access to user context through dependencies.",
        )
        
        # Test with different dependencies
        deps1 = TestDependencies(user_id=self.user.id, document_id=self.doc1.id)
        deps2 = TestDependencies(user_id=self.user.id, corpus_id=self.corpus.id)
        
        with agent.override(deps=deps1):
            result1 = agent.run_sync("What document am I working with?")
            self.assertIsInstance(result1.data, str)
        
        with agent.override(deps=deps2):
            result2 = agent.run_sync("What corpus am I working with?")
            self.assertIsInstance(result2.data, str)

    def test_pydantic_ai_vector_search_request_validation(self) -> None:
        """Test PydanticAI vector search request validation."""
        # Valid request
        request = PydanticAIVectorSearchRequest(
            query_text="test query",
            similarity_top_k=10,
            filters={"label": "Important Label"}
        )
        
        self.assertEqual(request.query_text, "test query")
        self.assertEqual(request.similarity_top_k, 10)
        self.assertEqual(request.filters["label"], "Important Label")
        
        # Request with embedding instead of text
        embedding_request = PydanticAIVectorSearchRequest(
            query_embedding=constant_vector(384, 0.5),
            similarity_top_k=5,
        )
        
        self.assertIsNone(embedding_request.query_text)
        self.assertEqual(len(embedding_request.query_embedding), 384)
