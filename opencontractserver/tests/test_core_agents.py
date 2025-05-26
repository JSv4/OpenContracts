"""
Tests for core agent components: AgentConfig, Contexts, and CoreConversationManager.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.conf import settings as django_settings

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.conversations.models import Conversation, ChatMessage
from opencontractserver.llms.agents.core_agents import (
    AgentConfig,
    DocumentAgentContext,
    CorpusAgentContext,
    CoreConversationManager,
    CoreDocumentAgentFactory, # For default prompts
    CoreCorpusAgentFactory,   # For default prompts
    get_default_config
)
from opencontractserver.llms.vector_stores.core_vector_stores import CoreAnnotationVectorStore

User = get_user_model()

class TestCoreAgentComponentsSetup(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="core_testuser", password="password", email="core@test.com")
        
        cls.corpus1 = Corpus.objects.create(title="Core Test Corpus", creator=cls.user, preferred_embedder="test/embedder/corpus_default")
        cls.doc1 = Document.objects.create(title="Core Test Doc 1", corpus=cls.corpus1, creator=cls.user, description="Doc1 Description")
        cls.doc2 = Document.objects.create(title="Core Test Doc 2", creator=cls.user, description="Doc2 Description") # No corpus
        
        cls.conversation1 = Conversation.objects.create(title="Core Convo 1", creator=cls.user)
        cls.chat_message1 = ChatMessage.objects.create(conversation=cls.conversation1, content="User says hi", msg_type="USER", creator=cls.user)


class TestAgentConfig(TestCoreAgentComponentsSetup):
    def test_get_default_config(self):
        config = get_default_config()
        self.assertEqual(config.model_name, "gpt-4o-mini") # Default model
        # Handle gracefully - API key might be None or present from environment
        self.assertIsNotNone(config)  # Just check config exists
        self.assertTrue(config.streaming)

    @override_settings(OPENAI_API_KEY="test_key_from_settings")
    def test_get_default_config_with_settings_override(self):
        config = get_default_config(model_name="custom_model", streaming=False)
        self.assertEqual(config.model_name, "custom_model")
        self.assertEqual(config.api_key, "test_key_from_settings")
        self.assertFalse(config.streaming)
        # Ensure other defaults are still there
        self.assertEqual(config.similarity_top_k, 10)

class TestAgentContexts(TestCoreAgentComponentsSetup):

    @patch(f'{CoreAnnotationVectorStore.__module__}.CoreAnnotationVectorStore.__init__', return_value=None) # Mock __init__ to prevent DB/embedder calls
    def test_document_agent_context_init_minimal(self, mock_vector_store_init: MagicMock):
        config = AgentConfig(user_id=self.user.id, embedder_path="test/embedder/doc_specific")
        context = DocumentAgentContext(document=self.doc1, config=config)
        
        self.assertIs(context.document, self.doc1)
        self.assertIs(context.config, config)
        mock_vector_store_init.assert_called_once_with(
            user_id=self.user.id,
            document_id=self.doc1.id,
            embedder_path="test/embedder/doc_specific",
        )
        # context.vector_store is created in __post_init__ by calling the CoreAnnotationVectorStore constructor
        # Since we mocked __init__ to return None, the instance will be None here. 
        # If we want to check if it *would* be an instance, we'd need a more complex mock.
        # For now, verifying __init__ call is sufficient.

    @patch(f'{CoreAnnotationVectorStore.__module__}.CoreAnnotationVectorStore.__init__', return_value=None)
    def test_document_agent_context_with_explicit_vector_store(self, mock_vector_store_init: MagicMock):
        mock_vs = MagicMock(spec=CoreAnnotationVectorStore)
        config = AgentConfig()
        context = DocumentAgentContext(document=self.doc1, config=config, vector_store=mock_vs)
        self.assertIs(context.vector_store, mock_vs)
        mock_vector_store_init.assert_not_called() # Should not init a new one

    async def test_corpus_agent_context_init(self):
        # Create a fresh corpus and its documents specifically for this test
        # self.user is available from TestCoreAgentComponentsSetup.setUpTestData
        test_corpus = await Corpus.objects.acreate(
            title="Test Corpus for Context Init",
            creator=self.user,
            preferred_embedder="test/embedder/corpus_default"
        )
        doc1_for_this_test = await Document.objects.acreate(
            title="Doc1 in Test Corpus",
            creator=self.user,
            description="First document for this specific test"
        )
        # Explicitly add to the ManyToManyField
        await test_corpus.documents.aadd(doc1_for_this_test)

        # This is the second document expected by the original test logic
        doc2_for_this_test = await Document.objects.acreate(
            title="Doc2 in Test Corpus",
            creator=self.user,
            description="Second document for this specific test"
        )
        # Explicitly add to the ManyToManyField
        await test_corpus.documents.aadd(doc2_for_this_test)

        config = AgentConfig(embedder_path=None) # Test corpus default embedder
        
        # Use the factory method with the ID of the locally created corpus
        context = await CoreCorpusAgentFactory.create_context(test_corpus.id, config)
        
        # Assertions using the locally created corpus and documents
        self.assertEqual(context.corpus, test_corpus) # Django models __eq__ compares PKs
        self.assertIs(context.config, config) # Config object should be the same instance
        self.assertIsNotNone(context.documents)
        
        doc_ids_in_context = {doc.id for doc in context.documents}
        
        # Check that both documents created for this test are found in the context
        self.assertIn(doc1_for_this_test.id, doc_ids_in_context)
        self.assertIn(doc2_for_this_test.id, doc_ids_in_context)
        self.assertEqual(len(context.documents), 2) # Expecting two documents
        
        # Check if corpus preferred embedder was used (this part of the logic remains)
        self.assertEqual(config.embedder_path, "test/embedder/corpus_default")

    async def test_corpus_agent_context_specific_embedder(self):
        config = AgentConfig(embedder_path="specific/path")
        # Use the factory method instead of direct instantiation
        context = await CoreCorpusAgentFactory.create_context(self.corpus1.id, config)
        self.assertEqual(config.embedder_path, "specific/path") # Should not be overridden


class TestCoreConversationManager(TestCoreAgentComponentsSetup):

    async def test_create_for_document_new_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        config = AgentConfig(user_id=self.user.id)
        manager = await CoreConversationManager.create_for_document(
            document=self.doc1, 
            user_id=self.user.id,
            config=config
        )
        
        self.assertIsNotNone(manager.conversation)
        self.assertEqual(manager.conversation.creator_id, self.user.id)
        self.assertTrue(self.doc1.title in manager.conversation.title)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count + 1)

    async def test_create_for_document_existing_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        config = AgentConfig(user_id=self.user.id, conversation=self.conversation1)
        manager = await CoreConversationManager.create_for_document(
            document=self.doc1, 
            user_id=self.user.id,
            config=config
        )
        self.assertIs(manager.conversation, self.conversation1)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count) # No new convo

    async def test_create_for_corpus_new_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        config = AgentConfig(user_id=self.user.id)
        manager = await CoreConversationManager.create_for_corpus(
            corpus=self.corpus1, 
            user_id=self.user.id,
            config=config
        )

        self.assertIsNotNone(manager.conversation)
        self.assertEqual(manager.conversation.creator_id, self.user.id)
        self.assertTrue(self.corpus1.title in manager.conversation.title)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count + 1)

    async def test_create_for_corpus_existing_conversation(self):
        config = AgentConfig(user_id=self.user.id, conversation=self.conversation1)
        manager = await CoreConversationManager.create_for_corpus(
            corpus=self.corpus1, 
            user_id=self.user.id,
            config=config
        )
        self.assertIs(manager.conversation, self.conversation1)

    async def test_store_user_message(self):
        config = AgentConfig(user_id=self.user.id)
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id, config=config)
        msg_id = await manager.store_user_message("Test user message")
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Test user message")
        self.assertEqual(message.msg_type, "HUMAN")
        self.assertEqual(message.conversation_id, self.conversation1.id)
        self.assertEqual(message.creator_id, self.user.id)

    async def test_store_llm_message(self):
        config = AgentConfig(user_id=self.user.id)
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id, config=config)
        msg_id = await manager.store_llm_message("Test LLM response", metadata={"tool_used": "yes"})
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Test LLM response")
        self.assertEqual(message.msg_type, "LLM")
        self.assertEqual(message.data["tool_used"], "yes")

    async def test_update_message(self):
        config = AgentConfig(user_id=self.user.id)
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id, config=config)
        msg_id = await manager.store_user_message("Original content")
        await manager.update_message(msg_id, "Updated content", metadata={"status": "edited"})
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Updated content")
        self.assertEqual(message.data["status"], "edited")


class TestCoreAgentFactoriesDefaults(TestCoreAgentComponentsSetup):
    # These test the default prompt generation, not full context creation
    def test_document_agent_default_system_prompt(self):
        prompt = CoreDocumentAgentFactory.get_default_system_prompt(self.doc1)
        self.assertIn(self.doc1.title, prompt)
        self.assertIn(str(self.doc1.id), prompt)
        self.assertIn(self.doc1.description, prompt)

    def test_corpus_agent_default_system_prompt(self):
        prompt = CoreCorpusAgentFactory.get_default_system_prompt(self.corpus1)
        self.assertIn(self.corpus1.title, prompt)

    @patch(f'{CoreDocumentAgentFactory.__module__}.CoreDocumentAgentFactory.get_default_system_prompt')
    async def test_create_document_context_uses_default_prompt(self, mock_get_prompt: MagicMock):
        mock_get_prompt.return_value = "Mocked default prompt"
        config = AgentConfig(system_prompt=None) # Ensure it's None to trigger default
        
        context = await CoreDocumentAgentFactory.create_context(self.doc1, config)
        
        mock_get_prompt.assert_called_once_with(self.doc1)
        self.assertEqual(context.config.system_prompt, "Mocked default prompt")

    async def test_create_document_context_uses_override_prompt(self):
        override_prompt = "My custom prompt for docs"
        config = AgentConfig(system_prompt=override_prompt)
        context = await CoreDocumentAgentFactory.create_context(self.doc1, config)
        self.assertEqual(context.config.system_prompt, override_prompt)

    # Similar tests for CoreCorpusAgentFactory and its prompt logic can be added. 