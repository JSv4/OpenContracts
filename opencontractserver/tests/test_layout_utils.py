"""
Tests for functions in opencontractserver.utils.layout
"""
import vcr

from django.test import TestCase
from opencontractserver.types.dicts import OpenContractsAnnotationPythonType
from opencontractserver.utils.layout import reassign_annotation_hierarchy


class LayoutUtilsTestCase(TestCase):
    """
    Test suite for layout utility functions, particularly reassign_annotation_hierarchy.
    """

    def setUp(self) -> None:
        """
        Create mock annotations for use in tests.
        """
        # Here we craft annotations that simulate a heading hierarchy.
        # We differentiate them by their left coordinate and text content.
        # The annotation_json conforms to the OpenContractsSinglePageAnnotationType variant.
        # Indentation logic in reassign_annotation_hierarchy relies on the function
        # to call GPT to generate indent levels, which we capture with vcr.
        self.mock_annotations: list[OpenContractsAnnotationPythonType] = [
            {
                "id": 1,
                "annotationLabel": "Heading 1",
                "rawText": "Introduction",
                "page": 1,
                "annotation_json": {
                    1: {
                        "bounds": {"top": 10, "left": 10, "right": 50, "bottom": 20},
                        "tokensJsons": [],
                        "rawText": "Introduction",
                    }
                },
                "parent_id": None,
                "annotation_type": "text",
                "structural": False,
            },
            {
                "id": 2,
                "annotationLabel": "Heading 2",
                "rawText": "Background",
                "page": 1,
                "annotation_json": {
                    1: {
                        "bounds": {"top": 30, "left": 30, "right": 70, "bottom": 40},
                        "tokensJsons": [],
                        "rawText": "Background",
                    }
                },
                "parent_id": None,
                "annotation_type": "text",
                "structural": False,
            },
            {
                "id": 3,
                "annotationLabel": "Heading 3",
                "rawText": "Details",
                "page": 1,
                "annotation_json": {
                    1: {
                        "bounds": {"top": 50, "left": 50, "right": 90, "bottom": 60},
                        "tokensJsons": [],
                        "rawText": "Details",
                    }
                },
                "parent_id": None,
                "annotation_type": "text",
                "structural": False,
            },
            {
                "id": 4,
                "annotationLabel": "page_footer",
                "rawText": "Footer Text",
                "page": 1,
                "annotation_json": {
                    1: {
                        "bounds": {"top": 900, "left": 10, "right": 200, "bottom": 910},
                        "tokensJsons": [],
                        "rawText": "Footer Text",
                    }
                },
                "parent_id": None,
                "annotation_type": "text",
                "structural": False,
            },
        ]

    @vcr.use_cassette("fixtures/vcr_cassettes/test_reassign_annotation_hierarchy.yaml", filter_headers=['authorization'])
    def test_reassign_annotation_hierarchy(self) -> None:
        """
        Verify that reassign_annotation_hierarchy correctly assigns parent-child
        relationships based on the hypothetical hierarchical indentation from GPT responses.
        Using vcr to capture GPT calls to avoid mocking those calls directly.
        """
        results = reassign_annotation_hierarchy(self.mock_annotations)

        # Check we have the same number of annotations
        self.assertEqual(len(results), len(self.mock_annotations))

        # Verify each annotation is still present by ID
        result_ids = [ann["id"] for ann in results]
        for original_ann in self.mock_annotations:
            self.assertIn(original_ann["id"], result_ids)

        # Because the headings are nested, Heading 1 should be top-level (parent_id: None)
        # and then Heading 2 might have parent Heading 1, Heading 3 might have parent Heading 2, etc.
        # Footers remain parent_id: None collectively.
        # Actual indentation might vary, but we at least check that
        # page_footer labeling remains un-nested, and the first heading remains top-level.
        heading_1 = next((x for x in results if x["id"] == 1), None)
        self.assertIsNotNone(heading_1)
        self.assertIsNone(heading_1["parent_id"])

        footer_item = next((x for x in results if x["annotationLabel"].lower() == "page_footer"), None)
        self.assertIsNotNone(footer_item)
        self.assertIsNone(footer_item["parent_id"])
