from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Relationship,
)
from opencontractserver.types.dicts import (
    OpenContractsAnnotationPythonType,
    OpenContractsRelationshipPythonType,
)
from opencontractserver.utils.importing import import_annotations, import_relationships


class TestImportUtils(TestCase):
    """
    Tests for import_annotations and import_relationships utility functions.
    """

    @classmethod
    def setUpTestData(cls):
        # Create user
        cls.user = get_user_model().objects.create(
            username="testuser", password="testpass"
        )

        # Optionally create a doc and corpus if needed
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.documents.models import Document

        cls.doc = Document.objects.create(title="Test Document", creator=cls.user)
        cls.corpus = Corpus.objects.create(title="Test Corpus", creator=cls.user)

        # Create some labels and a label lookup
        cls.label_1 = AnnotationLabel.objects.create(
            text="LabelOne",
            creator=cls.user,
            label_type="TOKEN_LABEL",
        )
        cls.label_2 = AnnotationLabel.objects.create(
            text="LabelTwo",
            creator=cls.user,
            label_type="TOKEN_LABEL",
        )
        cls.rel_label = AnnotationLabel.objects.create(
            text="RelationshipLabel",
            creator=cls.user,
            label_type="RELATIONSHIP_LABEL",
        )

        cls.label_lookup = {
            "LabelOne": cls.label_1,
            "LabelTwo": cls.label_2,
            "RelationshipLabel": cls.rel_label,
        }

    def test_import_annotations(self):
        """
        Test importing annotations with parent-child relationships,
        returning a mapping from old to new annotation IDs.
        """
        annotation_data: list[OpenContractsAnnotationPythonType] = [
            {
                "id": "old-annot-1",
                "annotationLabel": "LabelOne",
                "rawText": "Sample text 1",
                "page": 1,
                "annotation_json": {"bounds": [0, 0, 10, 10]},
                "parent_id": None,
                "annotation_type": None,
                "structural": False,
            },
            {
                "id": "old-annot-2",
                "annotationLabel": "LabelTwo",
                "rawText": "Sample text 2",
                "page": 2,
                "annotation_json": {"bounds": [10, 10, 20, 20]},
                "parent_id": "old-annot-1",
                "annotation_type": None,
                "structural": True,
            },
        ]

        old_id_map = import_annotations(
            user_id=self.user.id,
            doc_obj=self.doc,
            corpus_obj=self.corpus,
            annotations_data=annotation_data,
            label_lookup=self.label_lookup,
        )

        self.assertEqual(Annotation.objects.count(), 2)
        ann1 = Annotation.objects.get(raw_text="Sample text 1")
        ann2 = Annotation.objects.get(raw_text="Sample text 2")

        # Verify old->new mapping
        self.assertIn("old-annot-1", old_id_map)
        self.assertIn("old-annot-2", old_id_map)
        self.assertEqual(ann1.pk, old_id_map["old-annot-1"])
        self.assertEqual(ann2.pk, old_id_map["old-annot-2"])

        # Check parent relationship
        self.assertIsNone(ann1.parent, "First annotation should have no parent.")
        self.assertEqual(
            ann2.parent, ann1, "Second annotation should have the first as its parent."
        )
        self.assertTrue(ann2.structural, "Second annotation should be structural.")

    def test_import_relationships(self):
        """
        Test importing relationships, referencing existing annotations via
        the dict returned from import_annotations.
        """
        # Set up annotations first
        annotation_data: list[OpenContractsAnnotationPythonType] = [
            {
                "id": "old-a1",
                "annotationLabel": "LabelOne",
                "rawText": "Ann text 1",
                "page": 1,
                "annotation_json": {"bounds": [0, 0, 10, 10]},
                "parent_id": None,
                "annotation_type": None,
                "structural": False,
            },
            {
                "id": "old-a2",
                "annotationLabel": "LabelOne",
                "rawText": "Ann text 2",
                "page": 1,
                "annotation_json": {"bounds": [10, 10, 20, 20]},
                "parent_id": None,
                "annotation_type": None,
                "structural": False,
            },
            {
                "id": "old-a3",
                "annotationLabel": "LabelTwo",
                "rawText": "Ann text 3",
                "page": 2,
                "annotation_json": {"bounds": [20, 20, 30, 30]},
                "parent_id": None,
                "annotation_type": None,
                "structural": False,
            },
        ]

        # Get annotation_id_map from import_annotations
        annotation_id_map = import_annotations(
            user_id=self.user.id,
            doc_obj=self.doc,
            corpus_obj=self.corpus,
            annotations_data=annotation_data,
            label_lookup=self.label_lookup,
        )

        # Now define relationships to import
        relationship_data: list[OpenContractsRelationshipPythonType] = [
            {
                "id": "old-rel-1",
                "relationshipLabel": "RelationshipLabel",
                "source_annotation_ids": ["old-a1"],
                "target_annotation_ids": ["old-a2", "old-a3"],
            },
            {
                "id": "old-rel-2",
                "relationshipLabel": "RelationshipLabel",
                "source_annotation_ids": ["old-a2"],
                "target_annotation_ids": ["old-a3"],
            },
        ]

        old_rel_id_map = import_relationships(
            user_id=self.user.id,
            doc_obj=self.doc,
            corpus_obj=self.corpus,
            relationships_data=relationship_data,
            label_lookup=self.label_lookup,
            annotation_id_map=annotation_id_map,
        )

        self.assertEqual(Relationship.objects.count(), 2)
        rel1 = old_rel_id_map["old-rel-1"]
        rel2 = old_rel_id_map["old-rel-2"]

        self.assertEqual(rel1.source_annotations.count(), 1)
        self.assertEqual(rel1.target_annotations.count(), 2)
        self.assertEqual(rel2.source_annotations.count(), 1)
        self.assertEqual(rel2.target_annotations.count(), 1)

        ann_ids_rel1_source = list(rel1.source_annotations.values_list("id", flat=True))
        ann_ids_rel1_targets = list(
            rel1.target_annotations.values_list("id", flat=True)
        )

        ann_ids_rel2_source = list(rel2.source_annotations.values_list("id", flat=True))
        ann_ids_rel2_targets = list(
            rel2.target_annotations.values_list("id", flat=True)
        )

        # Validate that the correct DB IDs are in place
        self.assertIn(annotation_id_map["old-a1"], ann_ids_rel1_source)
        self.assertIn(annotation_id_map["old-a2"], ann_ids_rel1_targets)
        self.assertIn(annotation_id_map["old-a3"], ann_ids_rel1_targets)

        self.assertIn(annotation_id_map["old-a2"], ann_ids_rel2_source)
        self.assertIn(annotation_id_map["old-a3"], ann_ids_rel2_targets)
