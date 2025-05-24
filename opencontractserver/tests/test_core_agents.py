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
        
        cls.conversation1 = Conversation.objects.create(title="Core Convo 1", user=cls.user)
        cls.chat_message1 = ChatMessage.objects.create(conversation=cls.conversation1, content="User says hi", msg_type="USER", user=cls.user)


class TestAgentConfig(TestCoreAgentComponentsSetup):
    def test_get_default_config(self):
        config = get_default_config()
        self.assertEqual(config.model_name, "gpt-4o-mini") # Default model
        self.assertIsNone(config.api_key) # Should be None unless settings are overridden for test
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
        # Add another doc to corpus1 for this test
        doc_in_corpus = await Document.objects.acreate(title="Another Doc in Corpus", corpus=self.corpus1, creator=self.user)
        config = AgentConfig(embedder_path=None) # Test corpus default embedder
        
        context = await CorpusAgentContext(corpus=self.corpus1, config=config)
        
        self.assertIs(context.corpus, self.corpus1)
        self.assertIs(context.config, config)
        self.assertIsNotNone(context.documents)
        doc_ids_in_context = {doc.id for doc in context.documents}
        self.assertIn(self.doc1.id, doc_ids_in_context)
        self.assertIn(doc_in_corpus.id, doc_ids_in_context)
        self.assertEqual(len(context.documents), 2)
        # Check if corpus preferred embedder was used
        self.assertEqual(config.embedder_path, "test/embedder/corpus_default")

    async def test_corpus_agent_context_specific_embedder(self):
        config = AgentConfig(embedder_path="specific/path")
        context = await CorpusAgentContext(corpus=self.corpus1, config=config)
        self.assertEqual(config.embedder_path, "specific/path") # Should not be overridden


class TestCoreConversationManager(TestCoreAgentComponentsSetup):

    async def test_create_for_document_new_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        manager = await CoreConversationManager.create_for_document(document=self.doc1, user_id=self.user.id)
        
        self.assertIsNotNone(manager.conversation)
        self.assertEqual(manager.conversation.user, self.user)
        self.assertTrue(self.doc1.title in manager.conversation.title)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count + 1)

    async def test_create_for_document_existing_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        manager = await CoreConversationManager.create_for_document(
            document=self.doc1, 
            user_id=self.user.id, 
            override_conversation=self.conversation1
        )
        self.assertIs(manager.conversation, self.conversation1)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count) # No new convo

    async def test_create_for_corpus_new_conversation(self):
        initial_convo_count = await Conversation.objects.acount()
        manager = await CoreConversationManager.create_for_corpus(corpus=self.corpus1, user_id=self.user.id)

        self.assertIsNotNone(manager.conversation)
        self.assertEqual(manager.conversation.user, self.user)
        self.assertTrue(self.corpus1.title in manager.conversation.title)
        self.assertEqual(await Conversation.objects.acount(), initial_convo_count + 1)

    async def test_create_for_corpus_existing_conversation(self):
        manager = await CoreConversationManager.create_for_corpus(
            corpus=self.corpus1, 
            user_id=self.user.id, 
            override_conversation=self.conversation1
        )
        self.assertIs(manager.conversation, self.conversation1)

    async def test_store_user_message(self):
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id)
        msg_id = await manager.store_user_message("Test user message")
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Test user message")
        self.assertEqual(message.msg_type, "USER")
        self.assertEqual(message.conversation, self.conversation1)
        self.assertEqual(message.user, self.user)

    async def test_store_llm_message(self):
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id)
        msg_id = await manager.store_llm_message("Test LLM response", data={"tool_used": "yes"})
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Test LLM response")
        self.assertEqual(message.msg_type, "LLM")
        self.assertEqual(message.data, {"tool_used": "yes"})

    async def test_update_message(self):
        manager = CoreConversationManager(conversation=self.conversation1, user_id=self.user.id)
        msg_id = await manager.store_user_message("Original content")
        await manager.update_message(msg_id, "Updated content", data={"status": "edited"})
        message = await ChatMessage.objects.aget(id=msg_id)
        self.assertEqual(message.content, "Updated content")
        self.assertEqual(message.data, {"status": "edited"})


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