"""
Comprehensive test suite for corpus export mutations.
Tests the StartCorpusExport mutation functionality including analysis filtering.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.annotations.models import AnnotationLabel, LabelSet
from opencontractserver.documents.models import Document
from opencontractserver.tests.base import BaseFixtureTestCase
from opencontractserver.types.enums import ExportType

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class TestExportMutations(BaseFixtureTestCase):
    """
    Comprehensive test suite for export mutations verifying:
    1. Basic export functionality works
    2. Analysis filtering parameters are properly handled
    3. Different annotation filter modes work correctly
    4. Both OPEN_CONTRACTS and FUNSD export formats work
    """

    def setUp(self):
        super().setUp()

        # Create a test label set
        self.label_set = LabelSet.objects.create(
            title="Test Label Set",
            description="Test Label Set for Export Testing",
            creator=self.user,
        )

        # Create annotation labels
        self.label1 = AnnotationLabel.objects.create(
            text="Test Label 1",
            description="First test label",
            creator=self.user,
        )

        self.label2 = AnnotationLabel.objects.create(
            text="Test Label 2",
            description="Second test label",
            creator=self.user,
        )

        # Add labels to label set
        self.label_set.annotation_labels.add(self.label1, self.label2)

        # Update corpus with label set
        self.corpus.label_set = self.label_set
        self.corpus.save()

        # Add documents to corpus
        for doc in self.docs[:2]:  # Add first 2 docs
            doc.corpus = self.corpus
            doc.save()

    def test_basic_export_without_parameters(self):
        """
        Test that basic export works without any analysis parameters.
        This is the default use case for most exports.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus($corpusId: String!, $exportFormat: ExportType!) {
                exportCorpus(corpusId: $corpusId, exportFormat: $exportFormat) {
                    ok
                    message
                    export {
                        id
                        name
                        started
                        finished
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
        }

        print("\n=== Test: Basic export without analysis parameters ===")
        print(f"Corpus ID: {self.corpus.id}")
        print(
            f"Documents in corpus: {Document.objects.filter(corpus=self.corpus).count()}"
        )

        response = client.execute(mutation, variables=variables)

        # Check for errors
        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        # Verify success
        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")
        self.assertIsNotNone(result["export"]["id"])

        print("✅ Basic export completed successfully")

    def test_export_with_empty_analysis_list(self):
        """
        Test that export works when an empty analysis list is provided.
        This verifies the mutation handles empty lists correctly.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $analysesIds: [String!]
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    analysesIds: $analysesIds
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
            "analysesIds": [],  # Empty list
        }

        print("\n=== Test: Export with empty analysis list ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ Export with empty analysis list works correctly")

    def test_export_with_corpus_labelset_only_mode(self):
        """
        Test export with CORPUS_LABELSET_ONLY filter mode (default).
        This mode only includes annotations from the corpus's label set.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $annotationFilterMode: AnnotationFilterMode
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    annotationFilterMode: $annotationFilterMode
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
            "annotationFilterMode": "CORPUS_LABELSET_ONLY",
        }

        print("\n=== Test: Export with CORPUS_LABELSET_ONLY mode ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ CORPUS_LABELSET_ONLY mode works correctly")

    def test_export_with_corpus_plus_analyses_mode(self):
        """
        Test export with CORPUS_LABELSET_PLUS_ANALYSES filter mode.
        This mode combines corpus label set with specified analyses.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $annotationFilterMode: AnnotationFilterMode,
                $analysesIds: [String!]
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    annotationFilterMode: $annotationFilterMode,
                    analysesIds: $analysesIds
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
            "annotationFilterMode": "CORPUS_LABELSET_PLUS_ANALYSES",
            "analysesIds": [],  # Empty for this test, but would normally contain analysis IDs
        }

        print("\n=== Test: Export with CORPUS_LABELSET_PLUS_ANALYSES mode ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ CORPUS_LABELSET_PLUS_ANALYSES mode works correctly")

    def test_export_with_analyses_only_mode(self):
        """
        Test export with ANALYSES_ONLY filter mode.
        This mode only includes annotations from specified analyses.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $annotationFilterMode: AnnotationFilterMode,
                $analysesIds: [String!]
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    annotationFilterMode: $annotationFilterMode,
                    analysesIds: $analysesIds
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
            "annotationFilterMode": "ANALYSES_ONLY",
            "analysesIds": [],  # Empty list means no annotations will be included
        }

        print("\n=== Test: Export with ANALYSES_ONLY mode ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ ANALYSES_ONLY mode works correctly")

    def test_funsd_export_format(self):
        """
        Test that FUNSD export format works correctly.
        FUNSD is an alternative export format for form understanding.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.FUNSD.value,
        }

        print("\n=== Test: FUNSD export format ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ FUNSD export format works correctly")

    def test_funsd_export_with_analysis_filter(self):
        """
        Test FUNSD export with analysis filtering parameters.
        Verifies FUNSD format works with the same filtering options.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $analysesIds: [String!]
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    analysesIds: $analysesIds
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.FUNSD.value,
            "analysesIds": [],  # Empty analysis list
        }

        print("\n=== Test: FUNSD export with analysis filter ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ FUNSD export with filtering works correctly")

    def test_export_with_post_processors(self):
        """
        Test export with post-processors parameter.
        Post-processors can transform the export after generation.
        """
        client = Client(schema, context_value=TestContext(self.user))

        mutation = """
            mutation ExportCorpus(
                $corpusId: String!,
                $exportFormat: ExportType!,
                $postProcessors: [String!]
            ) {
                exportCorpus(
                    corpusId: $corpusId,
                    exportFormat: $exportFormat,
                    postProcessors: $postProcessors
                ) {
                    ok
                    message
                    export {
                        id
                        name
                        errors
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "exportFormat": ExportType.OPEN_CONTRACTS.value,
            "postProcessors": [],  # Empty list of post-processors
        }

        print("\n=== Test: Export with post-processors parameter ===")

        response = client.execute(mutation, variables=variables)

        self.assertNotIn(
            "errors", response, f"GraphQL errors: {response.get('errors')}"
        )

        result = response["data"]["exportCorpus"]
        self.assertTrue(result["ok"], f"Export failed: {result['message']}")
        self.assertEqual(result["message"], "SUCCESS")

        print("✅ Export with post-processors parameter works correctly")
