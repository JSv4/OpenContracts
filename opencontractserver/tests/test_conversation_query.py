from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from graphql_relay import to_global_id
from graphene.test import Client

from config.graphql.schema import schema
from opencontractserver.conversations.models import Conversation, ChatMessage

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document


User = get_user_model()

class TestContext:
    def __init__(self, user):
        self.user = user


class GraphQLConversationTestCase(TestCase):
    """
    TestCase for testing the Conversation GraphQL resolver.
    """

    def setUp(self) -> None:
        # Create a test user and authenticate
        self.user = User.objects.create_user(
            username="graphql_testuser", password="testpassword"
        )
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

        # Create messages for the conversation
        self.messages = [
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

        # Create messages for the document conversation
        self.doc_messages = [
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

    def test_resolve_conversation_with_corpus_id(self):
        """
        Test the conversation resolver by querying with a corpus_id.
        Ensures that the correct conversation and its messages are returned in order.
        """
        query = """
        query GetConversation($corpusId: ID!) {
            conversation(corpusId: $corpusId) {
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
        """

        # Encode the corpus ID using the relay global ID format
        corpus_global_id = to_global_id("CorpusType", self.corpus.id)  # Adjust if necessary

        variables = {"corpusId": corpus_global_id}

        response = self.client.execute(query, variables=variables)
        self.assertIsNone(response.get("errors"), f"GraphQL errors: {response.get('errors')}")

        data = response.get("data")
        self.assertIsNotNone(data, "No data returned in GraphQL response.")

        conversation_data = data.get("conversation")
        self.assertIsNotNone(conversation_data, "Conversation data not found in response.")
        self.assertEqual(
            conversation_data["title"], "Test Conversation with Corpus"
        )

        messages = conversation_data.get("chatMessages",{}).get("edges",[])
        self.assertEqual(len(messages), 3, "Incorrect number of messages returned.")

        # Ensure messages are sorted oldest to newest
        expected_contents = [
            "Hello, this is a test message.",
            "Hello! How can I assist you today?",
            "I have a question about the corpus.",
        ]
        returned_contents = [msg['node']["content"] for msg in messages]
        self.assertEqual(
            returned_contents,
            expected_contents,
            "Messages are not sorted correctly.",
        )

    def test_resolve_conversation_with_document_id(self):
        """
        Test the conversation resolver by querying with a document_id.
        Ensures that the correct conversation and its messages are returned in order.
        """
        query = """
        query GetConversation($documentId: ID!) {
            conversation(documentId: $documentId) {
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
        """

        # Encode the document ID using the relay global ID format
        document_global_id = to_global_id("DocumentType", self.doc.id)  # Adjust if necessary

        variables = {"documentId": document_global_id}

        response = self.client.execute(query, variables=variables)
        self.assertIsNone(response.get("errors"), f"GraphQL errors: {response.get('errors')}")

        data = response.get("data")
        self.assertIsNotNone(data, "No data returned in GraphQL response.")

        conversation_data = data.get("conversation")
        self.assertIsNotNone(conversation_data, "Conversation data not found in response.")
        self.assertEqual(
            conversation_data["title"], "Test Conversation with Document"
        )

        messages = conversation_data.get("chatMessages",{}).get("edges",[])
        self.assertEqual(len(messages), 2, "Incorrect number of messages returned.")

        # Ensure messages are sorted oldest to newest
        expected_contents = [
            "Starting document-specific conversation.",
            "Document-specific assistance at your service.",
        ]
        returned_contents = [msg['node']["content"] for msg in messages]
        self.assertEqual(
            returned_contents,
            expected_contents,
            "Messages are not sorted correctly.",
        )

    def test_resolve_conversation_with_both_ids(self):
        """
        Test that providing both document_id and corpus_id raises an error.
        """
        query = """
        query GetConversation($documentId: ID!, $corpusId: ID!) {
            conversation(documentId: $documentId, corpusId: $corpusId) {
                id
                title
            }
        }
        """

        # Encode the IDs using the relay global ID format
        corpus_global_id = to_global_id("CorpusType", self.corpus.id)  # Adjust if necessary
        document_global_id = to_global_id("DocumentType", self.doc.id)  # Adjust if necessary

        variables = {
            "documentId": document_global_id,
            "corpusId": corpus_global_id,
        }

        response = self.client.execute(query, variables=variables)
        self.assertIsNotNone(response.get("errors"), "Expected errors when providing both IDs.")
        error_message = response["errors"][0]["message"]
        self.assertIn(
            "You must provide exactly one of document_id or corpus_id", error_message
        )

    def test_resolve_conversation_with_no_ids(self):
        """
        Test that providing neither document_id nor corpus_id raises an error.
        """
        query = """
        query GetConversation {
            conversation {
                id
                title
            }
        }
        """

        response = self.client.execute(query)
        self.assertIsNotNone(response.get("errors"), "Expected errors when providing no IDs.")
        error_message = response["errors"][0]["message"]
        self.assertIn(
            "You must provide exactly one of document_id or corpus_id", error_message
        ) 