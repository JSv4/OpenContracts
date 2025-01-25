import json
import logging
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import transaction
from graphene.test import Client
from graphql_relay import to_global_id, from_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.annotations.models import Note, Annotation, AnnotationLabel
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()
logger = logging.getLogger(__name__)


class TestContext:
    def __init__(self, user):
        self.user = user


class NoteTreeTestCase(BaseFixtureTestCase):
    maxDiff = None

    def setUp(self):
        
        super().setUp()

        self.client = Client(schema, context_value=TestContext(self.user))
        logger.info("Created test client")

        # Create test data
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.doc.corpus = self.corpus
        self.doc.save()
        
        # Optional: Create an annotation to test note-to-annotation linking
        self.annotation_label = AnnotationLabel.objects.create(
            text="Test Label", creator=self.user
        )
        self.annotation = Annotation.objects.create(
            document=self.doc,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Test Annotation",
            creator=self.user,
        )

        # Create a hierarchy of notes
        self.root_note = Note.objects.create(
            document=self.doc,
            title="Root Note",
            content="Root Content",
            creator=self.user,
            parent=None,
        )

        self.child_note_1 = Note.objects.create(
            document=self.doc,
            title="Child Note 1",
            content="Child Content 1",
            creator=self.user,
            parent=self.root_note,
        )

        self.child_note_2 = Note.objects.create(
            document=self.doc,
            title="Child Note 2",
            content="Child Content 2",
            creator=self.user,
            parent=self.root_note,
        )

        self.grandchild_note = Note.objects.create(
            document=self.doc,
            title="Grandchild Note",
            content="Grandchild Content",
            creator=self.user,
            parent=self.child_note_1,
        )

    def test_descendants_tree(self):
        query = """
        query($id: ID!) {
            note(id: $id) {
                id
                descendantsTree
            }
        }
        """
        variables = {"id": to_global_id("NoteType", self.root_note.id)}

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        descendants_tree = result["data"]["note"]["descendantsTree"]

        expected_descendants_tree = [
            {
                "id": to_global_id("NoteType", self.child_note_1.id),
                "content": "Child Content 1",
                "children": [
                    to_global_id("NoteType", self.grandchild_note.id)
                ],
            },
            {
                "id": to_global_id("NoteType", self.child_note_2.id),
                "content": "Child Content 2",
                "children": [],
            },
            {
                "id": to_global_id("NoteType", self.grandchild_note.id),
                "content": "Grandchild Content",
                "children": [],
            },
        ]

        print("\nDescendants Tree Test:")
        print("Actual (descendants_tree):")
        print(json.dumps(descendants_tree, indent=2))
        print("\nExpected (expected_descendants_tree):")
        print(json.dumps(expected_descendants_tree, indent=2))

        self.assertEqual(descendants_tree, expected_descendants_tree)

    def test_full_tree(self):
        query = """
        query($id: ID!) {
            note(id: $id) {
                id
                fullTree
            }
        }
        """
        variables = {"id": to_global_id("NoteType", self.grandchild_note.id)}

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        full_tree = result["data"]["note"]["fullTree"]

        expected_full_tree = [
            {
                "id": to_global_id("NoteType", self.root_note.id),
                "content": "Root Content",
                "children": [
                    to_global_id("NoteType", self.child_note_1.id),
                    to_global_id("NoteType", self.child_note_2.id),
                ],
            },
            {
                "id": to_global_id("NoteType", self.child_note_1.id),
                "content": "Child Content 1",
                "children": [
                    to_global_id("NoteType", self.grandchild_note.id)
                ],
            },
            {
                "id": to_global_id("NoteType", self.child_note_2.id),
                "content": "Child Content 2",
                "children": [],
            },
            {
                "id": to_global_id("NoteType", self.grandchild_note.id),
                "content": "Grandchild Content",
                "children": [],
            },
        ]

        print("\nFull Tree Test:")
        print("Actual (full_tree):")
        print(json.dumps(full_tree, indent=2))
        print("\nExpected (expected_full_tree):")
        print(json.dumps(expected_full_tree, indent=2))

        self.assertEqual(full_tree, expected_full_tree)

    def test_stress_test(self):
        # Create a large tree with 1000 notes
        total_nodes = 0
        max_nodes = 1000

        root_note = Note.objects.create(
            document=self.doc,
            title="Root Note",
            content="Root Content",
            creator=self.user,
            parent=None,
        )
        total_nodes += 1

        current_level = [root_note]

        while total_nodes < max_nodes:
            next_level = []
            for parent_note in current_level:
                # Create left child
                left_child = Note.objects.create(
                    document=self.doc,
                    title=f"Note {total_nodes + 1}",
                    content=f"Content {total_nodes + 1}",
                    creator=self.user,
                    parent=parent_note,
                )
                total_nodes += 1
                next_level.append(left_child)

                if total_nodes >= max_nodes:
                    break

                # Create right child
                right_child = Note.objects.create(
                    document=self.doc,
                    title=f"Note {total_nodes + 1}",
                    content=f"Content {total_nodes + 1}",
                    creator=self.user,
                    parent=parent_note,
                )
                total_nodes += 1
                next_level.append(right_child)

                if total_nodes >= max_nodes:
                    break
            current_level = next_level

        # Test descendants_tree
        query = """
        query($id: ID!) {
            note(id: $id) {
                id
                descendantsTree
            }
        }
        """
        variables = {"id": to_global_id("NoteType", root_note.id)}

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        descendants_tree = result["data"]["note"]["descendantsTree"]
        self.assertEqual(len(descendants_tree), total_nodes - 1)

        # Check first child
        first_child_id = descendants_tree[0]["id"]
        first_child_note = Note.objects.get(id=from_global_id(first_child_id)[1])
        self.assertEqual(first_child_note.parent_id, root_note.id)

        # Test full_tree
        query = """
        query($id: ID!) {
            note(id: $id) {
                id
                fullTree
            }
        }
        """
        variables = {"id": to_global_id("NoteType", root_note.id)}

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        full_tree = result["data"]["note"]["fullTree"]
        self.assertEqual(len(full_tree), total_nodes)

        root_node = next(
            (node for node in full_tree if node["id"] == to_global_id("NoteType", root_note.id)),
            None,
        )
        self.assertIsNotNone(root_node)
        self.assertEqual(root_node["content"], "Root Content")
        self.assertEqual(len(root_node["children"]), 2)

    def get_descendant_ids(self, node):
        """Helper method to get all descendant IDs of a node"""
        descendants = []
        for child in Note.objects.filter(parent=node):
            descendants.append(child.id)
            descendants.extend(self.get_descendant_ids(child))
        return descendants

    def get_ancestor_ids(self, node):
        """Helper method to get all ancestor IDs of a node"""
        ancestors = []
        current = node.parent
        while current:
            ancestors.append(current.id)
            current = current.parent
        return ancestors 