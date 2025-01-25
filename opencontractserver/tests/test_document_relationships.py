from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentRelationship
from opencontractserver.annotations.models import AnnotationLabel
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class DocumentRelationshipsQueryTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))
        
        # Create test corpus
        self.corpus = Corpus.objects.create(
            title="TestCorpus",
            creator=self.user,
        )

        # Create test documents
        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )
        
        self.source_doc = Document.objects.create(
            creator=self.user,
            title="Source Doc",
            description="Source document",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True
        )
        
        self.target_doc = Document.objects.create(
            creator=self.user,
            title="Target Doc",
            description="Target document",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True
        )

        # Create test annotation label
        self.annotation_label = AnnotationLabel.objects.create(
            text="Test Relationship",
            label_type="DOC_RELATIONSHIP_LABEL",
            creator=self.user,
        )

        # Create test relationships
        self.relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="RELATIONSHIP",
            annotation_label=self.annotation_label,
            creator=self.user,
        )

        self.note = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"note": "Test note content"},
            creator=self.user,
        )

    def test_document_relationship_query(self):
        query = """
            query {
                documentRelationship(id: "%s") {
                    id
                    relationshipType
                    sourceDocument {
                        id
                        title
                    }
                    targetDocument {
                        id
                        title
                    }
                    annotationLabel {
                        id
                        text
                    }
                    corpus {
                        id
                        title
                    }
                }
            }
        """ % to_global_id("DocumentRelationshipType", self.relationship.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        data = result["data"]["documentRelationship"]
        
        self.assertEqual(
            data["id"],
            to_global_id("DocumentRelationshipType", self.relationship.id),
        )
        self.assertEqual(data["relationshipType"], "RELATIONSHIP")
        self.assertEqual(
            data["sourceDocument"]["id"],
            to_global_id("DocumentType", self.source_doc.id),
        )
        self.assertEqual(
            data["targetDocument"]["id"],
            to_global_id("DocumentType", self.target_doc.id),
        )
        self.assertEqual(
            data["annotationLabel"]["id"],
            to_global_id("AnnotationLabelType", self.annotation_label.id),
        )

    def test_document_note_query(self):
        query = """
            query {
                documentRelationship(id: "%s") {
                    id
                    relationshipType
                    sourceDocument {
                        id
                        title
                    }
                    targetDocument {
                        id
                        title
                    }
                    data
                }
            }
        """ % to_global_id("DocumentRelationshipType", self.note.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        data = result["data"]["documentRelationship"]
        
        self.assertEqual(
            data["id"],
            to_global_id("DocumentRelationshipType", self.note.id),
        )
        self.assertEqual(data["relationshipType"], "NOTES")
        self.assertEqual(data["data"], {"note": "Test note content"})

    def test_document_all_relationships_query(self):
        query = """
            query {
                document(id: "%s") {
                    id
                    allDocRelationships(corpusId: "%s") {
                        id
                        relationshipType
                        sourceDocument {
                            id
                            title
                        }
                        targetDocument {
                            id
                            title
                        }
                    }
                }
            }
        """ % (
            to_global_id("DocumentType", self.source_doc.id),
            to_global_id("CorpusType", self.corpus.id),
        )

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        relationships = result["data"]["document"]["allDocRelationships"]
        
        self.assertEqual(len(relationships), 2)  # Should have both relationship and note
        relationship_types = {r["relationshipType"] for r in relationships}
        self.assertEqual(relationship_types, {"RELATIONSHIP", "NOTES"}) 