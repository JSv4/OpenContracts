from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.utils.permissioning import (
    PermissionTypes,
    set_permissions_for_obj_to_user,
)

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class GraphQLConversationTestCase(TestCase):
    """
    TestCase for testing the 'conversations' GraphQL resolver,
    which returns multiple conversations (rather than a single conversation).
    """

    def setUp(self) -> None:
        """
        Create test users, corpuses, documents, and conversations.
        Assign proper permissions so that one user cannot see another's conversations.
        """
        # Create two test users
        self.user = User.objects.create_user(
            username="graphql_testuser", password="testpassword"
        )
        self.other_user = User.objects.create_user(
            username="other_user", password="testpassword"
        )

        # Graphene client with context as self.user
        self.client = Client(schema, context_value=TestContext(self.user))

        # Create a test corpus and document
        self.corpus = Corpus.objects.create(title="GraphQL Test Corpus")
        pdf_file = ContentFile(b"%PDF-1.4 test pdf content", name="test_graphql.pdf")
        self.doc = Document.objects.create(
            creator=self.user,
            title="GraphQL Test Document",
            description="Description for GraphQL Test Document",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )
        self.corpus.documents.add(self.doc)
        self.corpus.save()

        # Create a conversation linked to the corpus
        self.conversation = Conversation.objects.create(
            title="Test Conversation with Corpus",
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        # Grant viewer permissions to self.user
        set_permissions_for_obj_to_user(
            user_val=self.user,
            instance=self.conversation,
            permissions=[PermissionTypes.ALL],
        )

        # Create messages for the conversation
        self.messages: list[ChatMessage] = [
            ChatMessage.objects.create(
                creator=self.user,
                conversation=self.conversation,
                msg_type="HUMAN",
                content="Hello, this is a test message.",
            ),
            ChatMessage.objects.create(
                creator=self.user,
                conversation=self.conversation,
                msg_type="LLM",
                content="Hello! How can I assist you today?",
            ),
            ChatMessage.objects.create(
                creator=self.user,
                conversation=self.conversation,
                msg_type="HUMAN",
                content="I have a question about the corpus.",
            ),
        ]

        # Create a conversation linked to the document
        self.doc_conversation = Conversation.objects.create(
            title="Test Conversation with Document",
            chat_with_document=self.doc,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            user_val=self.user,
            instance=self.doc_conversation,
            permissions=[PermissionTypes.ALL],
        )

        # Create messages for the document conversation
        self.doc_messages: list[ChatMessage] = [
            ChatMessage.objects.create(
                creator=self.user,
                conversation=self.doc_conversation,
                msg_type="HUMAN",
                content="Starting document-specific conversation.",
            ),
            ChatMessage.objects.create(
                creator=self.user,
                conversation=self.doc_conversation,
                msg_type="LLM",
                content="Document-specific assistance at your service.",
            ),
        ]

        # Create a conversation for the OTHER user (so that self.user cannot see it)
        self.other_user_conversation = Conversation.objects.create(
            title="Other User's Private Conversation",
            creator=self.other_user,
        )
        # Grant viewer permissions only to other_user
        set_permissions_for_obj_to_user(
            user_val=self.other_user,
            instance=self.other_user_conversation,
            permissions=[PermissionTypes.ALL],
        )
        # No permission for self.user

    def test_resolve_conversations_with_corpus_id(self):
        """
        Test the conversations resolver by filtering with a corpusId.
        Ensure that the correct conversation is returned (the one linked to the corpus).
        """
        query = """
        query GetConversations($corpusId: String) {
            conversations(corpusId: $corpusId) {
                edges {
                    node {
                        id
                        title
                        chatMessages {
                            edges {
                                node {
                                    id
                                    msgType
                                    content
                                    createdAt
                                }
                            }
                        }
                    }
                }
            }
        }
        """

        corpus_global_id = to_global_id("CorpusType", self.corpus.id)
        variables = {"corpusId": corpus_global_id}

        response = self.client.execute(query, variables=variables)
        self.assertIsNone(
            response.get("errors"),
            f"GraphQL returned errors: {response.get('errors')}",
        )

        data = response.get("data", {})
        edges = data.get("conversations", {}).get("edges", [])
        self.assertEqual(
            len(edges), 1, "Expected exactly 1 conversation for this corpus."
        )

        conversation_node = edges[0]["node"]
        self.assertEqual(
            conversation_node["title"],
            "Test Conversation with Corpus",
            "Conversation title does not match expected value.",
        )

        msg_edges = conversation_node["chatMessages"]["edges"]
        self.assertEqual(len(msg_edges), 3, "Expected exactly 3 messages.")
        expected_contents = [
            "Hello, this is a test message.",
            "Hello! How can I assist you today?",
            "I have a question about the corpus.",
        ]
        returned_contents = [msg["node"]["content"] for msg in msg_edges]
        self.assertEqual(returned_contents, expected_contents)

    def test_resolve_conversations_with_document_id(self):
        """
        Test the conversations resolver by filtering with a documentId.
        Ensure that the correct conversation is returned (the one linked to the document).
        """
        query = """
        query GetConversations($documentId: String) {
            conversations(documentId: $documentId) {
                edges {
                    node {
                        id
                        title
                        chatMessages {
                            edges {
                                node {
                                    id
                                    msgType
                                    content
                                    createdAt
                                }
                            }
                        }
                    }
                }
            }
        }
        """

        document_global_id = to_global_id("DocumentType", self.doc.id)
        variables = {"documentId": document_global_id}

        response = self.client.execute(query, variables=variables)
        self.assertIsNone(
            response.get("errors"),
            f"GraphQL returned errors: {response.get('errors')}",
        )

        data = response.get("data", {})
        edges = data.get("conversations", {}).get("edges", [])
        self.assertEqual(
            len(edges), 1, "Expected exactly 1 conversation for this document."
        )

        conversation_node = edges[0]["node"]
        self.assertEqual(
            conversation_node["title"],
            "Test Conversation with Document",
            "Conversation title does not match expected value.",
        )

        msg_edges = conversation_node["chatMessages"]["edges"]
        self.assertEqual(len(msg_edges), 2, "Expected exactly 2 messages.")
        expected_contents = [
            "Starting document-specific conversation.",
            "Document-specific assistance at your service.",
        ]
        returned_contents = [msg["node"]["content"] for msg in msg_edges]
        self.assertEqual(returned_contents, expected_contents)

    def test_user_cannot_see_others_conversations(self):
        """
        Ensure that a user cannot see conversations belonging to another user
        when they have no permissions on those conversations.
        """
        query = """
        query GetAllConversations {
            conversations {
                edges {
                    node {
                        id
                        title
                        creator {
                            username
                        }
                    }
                }
            }
        }
        """

        response = self.client.execute(query)
        self.assertIsNone(
            response.get("errors"),
            f"GraphQL returned errors: {response.get('errors')}",
        )

        data = response.get("data", {})
        edges = data.get("conversations", {}).get("edges", [])

        # Titles that belong to our user
        user_conversation_titles = {
            "Test Conversation with Corpus",
            "Test Conversation with Document",
        }

        found_titles = {conv["node"]["title"] for conv in edges}
        # The other user's conversation's title
        other_user_convo_title = "Other User's Private Conversation"

        # Verify user's own conversations are present
        for title in user_conversation_titles:
            self.assertIn(title, found_titles, f"{title} not found in the user's query")

        # Verify the other user's conversation is NOT present
        self.assertNotIn(
            other_user_convo_title,
            found_titles,
            "The other user's conversation was visible without permission!",
        )
