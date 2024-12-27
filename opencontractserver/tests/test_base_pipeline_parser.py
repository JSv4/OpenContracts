import logging
from typing import Optional

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
    OpenContractsRelationshipPythonType,
)

logger = logging.getLogger(__name__)


class MockParser(BaseParser):
    """
    A mock parser that simulates parsing a document and returns
    an OpenContractDocExport with both annotations and relationships.
    """

    title: str = "Mock Parser"
    description: str = "A parser for testing relationship creation."
    author: str = "TestAuthor"
    dependencies: list[str] = []

    def parse_document(
        self, user_id: int, doc_id: int
    ) -> Optional[OpenContractDocExport]:
        """
        Simulate parsing a document and returning annotation & relationship data.
        """
        # Simulate some annotation data
        annotation_data: list[OpenContractsAnnotationPythonType] = [
            {
                "id": "a1",
                "annotationLabel": "MockLabelA",
                "rawText": "Hello World",
                "page": 1,
                "annotation_json": {"bounds": [0, 0, 10, 10]},
                "parent_id": None,
                "annotation_type": None,
                "structural": False,
            },
            {
                "id": "a2",
                "annotationLabel": "MockLabelB",
                "rawText": "Foo Bar",
                "page": 1,
                "annotation_json": {"bounds": [10, 10, 20, 20]},
                "parent_id": "a1",  # second annotation references first as parent
                "annotation_type": None,
                "structural": True,
            },
        ]

        # Simulate some relationship data
        relationship_data: list[OpenContractsRelationshipPythonType] = [
            {
                "id": "r1",
                "relationshipLabel": "MockRelLabelA",
                "source_annotation_ids": ["a1"],
                "target_annotation_ids": ["a2"],
            }
        ]

        # Build the OpenContractDocExport
        export_data: OpenContractDocExport = {
            "title": "Mock Document Title",
            "content": "Some sample content for this mock doc.",
            "description": None,
            "pawls_file_content": [],
            "page_count": 1,
            "doc_labels": [],
            "labelled_text": annotation_data,
            "relationships": relationship_data,
        }
        return export_data


class TestMockParser(TestCase):
    def setUp(self):
        """
        Create a user, a document, a corpus, and a MockParser instance.
        """
        self.user = get_user_model().objects.create_user(
            username="testuser", password="testpass"
        )
        self.doc = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
        )
        self.parser = MockParser()

    def test_mock_parser_relationship_import(self):
        """
        Test the full cycle: parse_document returns a dict with annotations and relationships,
        then we call save_parsed_data to import them into the DB, verifying the relationships exist.
        """
        # 1) Parser returns an OpenContractDocExport
        parsed_data = self.parser.parse_document(
            user_id=self.user.id, doc_id=self.doc.id
        )
        self.assertIsNotNone(
            parsed_data, "Parser should return a valid OpenContractDocExport."
        )

        # 2) Use BaseParser's built-in save method to handle annotations & relationships
        self.parser.save_parsed_data(
            user_id=self.user.id,
            doc_id=self.doc.id,
            open_contracts_data=parsed_data,
            corpus_id=self.corpus.id,
            annotation_type="SPAN_LABEL",  # or "TOKEN_LABEL" as fallback
        )

        # 3) Verify Document associations
        self.doc.refresh_from_db()
        self.assertIn(
            self.doc,
            self.corpus.documents.all(),
            "Document should be in the specified corpus.",
        )

        # 4) Verify annotations
        self.assertEqual(
            Annotation.objects.count(), 2, "Should have created two annotations."
        )
        ann_a = Annotation.objects.get(raw_text="Hello World")
        ann_b = Annotation.objects.get(raw_text="Foo Bar")

        self.assertIsNone(ann_a.parent, "First annotation should have no parent.")
        self.assertEqual(
            ann_b.parent,
            ann_a,
            "Second annotation should reference first as its parent.",
        )
        self.assertTrue(
            ann_b.structural, "Second annotation's 'structural' flag should be True."
        )

        # 5) Verify relationship creation
        self.assertEqual(
            Relationship.objects.count(), 1, "Should have created one relationship."
        )
        relationship = Relationship.objects.first()
        self.assertEqual(
            relationship.relationship_label.text,
            "MockRelLabelA",
            "Relationship should have correct label.",
        )

        self.assertEqual(relationship.source_annotations.count(), 1)
        self.assertEqual(relationship.target_annotations.count(), 1)

        self.assertIn(
            ann_a,
            relationship.source_annotations.all(),
            "ann_a should be in relationship's source annotations.",
        )
        self.assertIn(
            ann_b,
            relationship.target_annotations.all(),
            "ann_b should be in relationship's target annotations.",
        )

        # 6) Verify that we also created distinct annotation labels
        label_a = AnnotationLabel.objects.get(text="MockLabelA")
        label_b = AnnotationLabel.objects.get(text="MockLabelB")
        rel_label = AnnotationLabel.objects.get(text="MockRelLabelA")

        self.assertEqual(label_a.label_type, "SPAN_LABEL")
        self.assertEqual(label_b.label_type, "SPAN_LABEL")
        self.assertEqual(rel_label.label_type, "RELATIONSHIP_LABEL")

        logger.info("MockParser test passed successfully.")
