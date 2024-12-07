import json
from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene_django.utils.testing import GraphQLTestCase
from graphql_relay import to_global_id

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document

User = get_user_model()

class AnnotationTreeTestCase(GraphQLTestCase):
    
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(username='testuser', password='testpassword')
        self.client.authenticate(self.user)

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
        response = self.query(query, variables=variables)
        content = json.loads(response.content)
        self.assertResponseNoErrors(response)

        # Parse the returned JSON tree
        descendants_tree = json.loads(content['data']['annotation']['descendantsTree'])

        # Expected tree structure with global IDs
        expected_tree = [
            {
                'id': to_global_id('AnnotationType', self.child_annotation_1.id),
                'raw_text': 'Child Annotation 1',
                'children': [
                    {
                        'id': to_global_id('AnnotationType', self.grandchild_annotation.id),
                        'raw_text': 'Grandchild Annotation',
                        'children': []
                    }
                ]
            },
            {
                'id': to_global_id('AnnotationType', self.child_annotation_2.id),
                'raw_text': 'Child Annotation 2',
                'children': []
            }
        ]

        # Assert that the returned tree matches the expected structure
        self.assertEqual(descendants_tree, expected_tree)
    
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
        response = self.query(query, variables=variables)
        content = json.loads(response.content)
        self.assertResponseNoErrors(response)

        # Parse the returned JSON tree
        full_tree = json.loads(content['data']['annotation']['fullTree'])

        # Expected tree structure with global IDs
        expected_tree = [
            {
                'id': to_global_id('AnnotationType', self.root_annotation.id),
                'raw_text': 'Root Annotation',
                'children': [
                    {
                        'id': to_global_id('AnnotationType', self.child_annotation_1.id),
                        'raw_text': 'Child Annotation 1',
                        'children': [
                            {
                                'id': to_global_id('AnnotationType', self.grandchild_annotation.id),
                                'raw_text': 'Grandchild Annotation',
                                'children': []
                            }
                        ]
                    },
                    {
                        'id': to_global_id('AnnotationType', self.child_annotation_2.id),
                        'raw_text': 'Child Annotation 2',
                        'children': []
                    }
                ]
            }
        ]

        # Assert that the returned tree matches the expected structure
        self.assertEqual(full_tree, expected_tree)