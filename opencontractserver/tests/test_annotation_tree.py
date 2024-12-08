import json
import logging
from django.db import transaction
from django.contrib.auth import get_user_model
from django.test import TestCase
from graphql_relay import to_global_id, from_global_id
from graphene.test import Client

from config.graphql.schema import schema
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document

User = get_user_model()

logger = logging.getLogger(__name__)

class TestContext:
    def __init__(self, user):
        self.user = user

class AnnotationTreeTestCase(TestCase):
    
    maxDiff = None  # Add this line at the class level
    
    def setUp(self):
        # Create a test user
        # Setup a test user
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")
        logger.info(f"Created test user: {self.user}")

        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

        logger.info("Created test clients")

        # Create test data
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
            corpus=self.corpus
        )
        self.annotation_label = AnnotationLabel.objects.create(
            text="Test Label",
            creator=self.user
        )

        # Create a hierarchy of annotations
        self.root_annotation = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Root Annotation",
            creator=self.user,
            parent=None  # Root annotation has no parent
        )

        self.child_annotation_1 = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Child Annotation 1",
            creator=self.user,
            parent=self.root_annotation
        )

        self.child_annotation_2 = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Child Annotation 2",
            creator=self.user,
            parent=self.root_annotation
        )

        self.grandchild_annotation = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Grandchild Annotation",
            creator=self.user,
            parent=self.child_annotation_1
        )
    
    def test_descendants_tree(self):
        # Construct the GraphQL query
        query = '''
        query($id: ID!) {
            annotation(id: $id) {
                id
                descendantsTree
            }
        }
        '''
        variables = {
            'id': to_global_id('AnnotationType', self.root_annotation.id)
        }

        # Execute the query
        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        # Access the returned tree directly
        descendants_tree = result['data']['annotation']['descendantsTree']

        # Expected flat list of descendants with immediate children's IDs
        expected_descendants_tree = [
            {
                'id': to_global_id('AnnotationType', self.child_annotation_1.id),
                'raw_text': 'Child Annotation 1',
                'children': [
                    to_global_id('AnnotationType', self.grandchild_annotation.id)
                ]
            },
            {
                'id': to_global_id('AnnotationType', self.child_annotation_2.id),
                'raw_text': 'Child Annotation 2',
                'children': []
            },
            {
                'id': to_global_id('AnnotationType', self.grandchild_annotation.id),
                'raw_text': 'Grandchild Annotation',
                'children': []
            }
        ]

        # Debug print
        print("\nDescendants Tree Test:")
        print("Actual (descendants_tree):")
        print(json.dumps(descendants_tree, indent=2))
        print("\nExpected (expected_descendants_tree):")
        print(json.dumps(expected_descendants_tree, indent=2))

        self.assertEqual(descendants_tree, expected_descendants_tree)
    
    def test_full_tree(self):
        # Test with grandchild annotation
        query = '''
        query($id: ID!) {
            annotation(id: $id) {
                id
                fullTree
            }
        }
        '''
        variables = {
            'id': to_global_id('AnnotationType', self.grandchild_annotation.id)
        }

        # Execute the query
        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        # Access the returned tree directly
        full_tree = result['data']['annotation']['fullTree']

        # Expected flat list of full tree with immediate children's IDs
        expected_full_tree = [
            {
                'id': to_global_id('AnnotationType', self.root_annotation.id),
                'raw_text': 'Root Annotation',
                'children': [
                    to_global_id('AnnotationType', self.child_annotation_1.id),
                    to_global_id('AnnotationType', self.child_annotation_2.id)
                ]
            },
            {
                'id': to_global_id('AnnotationType', self.child_annotation_1.id),
                'raw_text': 'Child Annotation 1',
                'children': [
                    to_global_id('AnnotationType', self.grandchild_annotation.id)
                ]
            },
            {
                'id': to_global_id('AnnotationType', self.child_annotation_2.id),
                'raw_text': 'Child Annotation 2',
                'children': []
            },
            {
                'id': to_global_id('AnnotationType', self.grandchild_annotation.id),
                'raw_text': 'Grandchild Annotation',
                'children': []
            }
        ]

        # Debug print
        print("\nFull Tree Test:")
        print("Actual (full_tree):")
        print(json.dumps(full_tree, indent=2))
        print("\nExpected (expected_full_tree):")
        print(json.dumps(expected_full_tree, indent=2))

        self.assertEqual(full_tree, expected_full_tree)
    
    def test_stress_test(self):
        # Programmatically create a large tree with at least 1000 annotations
        total_nodes = 0
        max_nodes = 1000

        # Create the root annotation
        root_annotation = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            annotation_label=self.annotation_label,
            raw_text="Root Annotation",
            creator=self.user,
            parent=None
        )
        total_nodes += 1

        # Level order traversal to build a balanced binary tree
        current_level = [root_annotation]

        while total_nodes < max_nodes:
            next_level = []
            for parent_annotation in current_level:
                # Create left child
                left_child = Annotation.objects.create(
                    document=self.document,
                    corpus=self.corpus,
                    annotation_label=self.annotation_label,
                    raw_text=f"Annotation {total_nodes + 1}",
                    creator=self.user,
                    parent=parent_annotation
                )
                total_nodes += 1
                next_level.append(left_child)

                if total_nodes >= max_nodes:
                    break

                # Create right child
                right_child = Annotation.objects.create(
                    document=self.document,
                    corpus=self.corpus,
                    annotation_label=self.annotation_label,
                    raw_text=f"Annotation {total_nodes + 1}",
                    creator=self.user,
                    parent=parent_annotation
                )
                total_nodes += 1
                next_level.append(right_child)

                if total_nodes >= max_nodes:
                    break
            current_level = next_level

        # Test the descendants_tree resolver
        query = '''
        query($id: ID!) {
            annotation(id: $id) {
                id
                descendantsTree
            }
        }
        '''
        variables = {
            'id': to_global_id('AnnotationType', root_annotation.id)
        }

        # Execute the query
        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        # Access the returned tree directly
        descendants_tree = result['data']['annotation']['descendantsTree']

        # Since we can't manually create the expected output for 1000 nodes,
        # we'll test that the number of returned nodes matches the total nodes minus 1 (excluding root)
        self.assertEqual(len(descendants_tree), total_nodes - 1)

        # Optionally, test a few known nodes
        # For example, check that the first child of the root is correct
        first_child_id = descendants_tree[0]['id']
        first_child_annotation = Annotation.objects.get(id=from_global_id(first_child_id)[1])
        self.assertEqual(first_child_annotation.parent_id, root_annotation.id)

        # Test the full_tree resolver
        query = '''
        query($id: ID!) {
            annotation(id: $id) {
                id
                fullTree
            }
        }
        '''
        variables = {
            'id': to_global_id('AnnotationType', root_annotation.id)
        }

        # Execute the query
        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        # Access the returned tree directly
        full_tree = result['data']['annotation']['fullTree']

        # Test that the number of nodes in full_tree matches total_nodes
        self.assertEqual(len(full_tree), total_nodes)

        # Assert that the root is correctly included
        root_node = next((node for node in full_tree if node['id'] == to_global_id('AnnotationType', root_annotation.id)), None)
        self.assertIsNotNone(root_node)
        self.assertEqual(root_node['raw_text'], "Root Annotation")
        self.assertEqual(len(root_node['children']), 2)  # Root should have two children in a balanced binary tree