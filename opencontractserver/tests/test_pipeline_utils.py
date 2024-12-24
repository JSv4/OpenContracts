import importlib
import os
import unittest
from unittest import TestCase

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.pipeline.utils import (
    get_all_embedders,
    get_all_parsers,
    get_all_subclasses,
    get_all_thumbnailers,
    get_component_by_name,
    get_components_by_mimetype,
    get_metadata_by_component_name,
    get_metadata_for_component,
)


class TestPipelineUtils(TestCase):
    @classmethod
    def setUpClass(cls):
        """
        Set up temporary test components in the appropriate packages.
        """
        cls.test_files = []

        # Define the test components as strings
        cls.parser_code = '''
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.dicts import OpenContractDocExport
from typing import Optional, List

class TestParser(BaseParser):
    """
    A test parser for unit testing.
    """

    title: str = "Test Parser"
    description: str = "A test parser for unit testing."
    author: str = "Test Author"
    dependencies: List[str] = []
    supported_file_types: List[FileTypeEnum] = [FileTypeEnum.PDF]

    def parse_document(self, user_id: int, doc_id: int) -> Optional[OpenContractDocExport]:
        # Return None or a dummy OpenContractDocExport for testing purposes
        return None
'''

        cls.embedder_code = '''
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from typing import Optional, List

class TestEmbedder(BaseEmbedder):
    """
    A test embedder for unit testing.
    """

    title: str = "Test Embedder"
    description: str = "A test embedder for unit testing."
    author: str = "Test Author"
    dependencies: List[str] = []
    vector_size: int = 128

    def embed_text(self, text: str) -> Optional[List[float]]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size
'''

        cls.thumbnailer_code = '''
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from typing import Optional, List
from django.core.files.base import File

class TestThumbnailer(BaseThumbnailGenerator):
    """
    A test thumbnail generator for unit testing.
    """

    title: str = "Test Thumbnailer"
    description: str = "A test thumbnailer for unit testing."
    author: str = "Test Author"
    dependencies: List[str] = []
    supported_file_types: List[FileTypeEnum] = [FileTypeEnum.PDF]

    def generate_thumbnail(self, file_bytes: bytes) -> Optional[File]:
        # Return None or a dummy File object for testing purposes
        return None
'''

        # Define the file paths for the components
        cls.parser_path = os.path.join(
            os.path.dirname(__file__), "..", "pipeline", "parsers", "test_parser.py"
        )
        cls.embedder_path = os.path.join(
            os.path.dirname(__file__), "..", "pipeline", "embedders", "test_embedder.py"
        )
        cls.thumbnailer_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "pipeline",
            "thumbnailers",
            "test_thumbnailer.py",
        )

        # Create the test component files
        os.makedirs(os.path.dirname(cls.parser_path), exist_ok=True)
        with open(cls.parser_path, "w") as f:
            f.write(cls.parser_code)
        cls.test_files.append(cls.parser_path)

        os.makedirs(os.path.dirname(cls.embedder_path), exist_ok=True)
        with open(cls.embedder_path, "w") as f:
            f.write(cls.embedder_code)
        cls.test_files.append(cls.embedder_path)

        os.makedirs(os.path.dirname(cls.thumbnailer_path), exist_ok=True)
        with open(cls.thumbnailer_path, "w") as f:
            f.write(cls.thumbnailer_code)
        cls.test_files.append(cls.thumbnailer_path)

        # Reload the importlib caches and modules
        importlib.invalidate_caches()
        importlib.reload(importlib.import_module("opencontractserver.pipeline.parsers"))
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.embedders")
        )
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.thumbnailers")
        )

    @classmethod
    def tearDownClass(cls):
        """
        Remove the temporary test components after tests are completed.
        """
        for file_path in cls.test_files:
            if os.path.exists(file_path):
                os.remove(file_path)
        # Optionally, you can remove the __pycache__ directories
        # in the package directories to clean up compiled files

    def test_get_all_subclasses(self):
        """
        Test get_all_subclasses function to ensure it returns all subclasses of a base class within a module.
        """
        # Test parsers
        parsers = get_all_subclasses("opencontractserver.pipeline.parsers", BaseParser)
        parser_titles = [parser.title for parser in parsers]
        self.assertIn("Test Parser", parser_titles)

        # Test embedders
        embedders = get_all_subclasses(
            "opencontractserver.pipeline.embedders", BaseEmbedder
        )
        embedder_titles = [embedder.title for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)

        # Test thumbnailers
        thumbnailers = get_all_subclasses(
            "opencontractserver.pipeline.thumbnailers", BaseThumbnailGenerator
        )
        thumbnailer_titles = [thumbnailer.title for thumbnailer in thumbnailers]
        self.assertIn("Test Thumbnailer", thumbnailer_titles)

    def test_get_all_parsers(self):
        """
        Test get_all_parsers function to ensure it returns all parser classes.
        """
        parsers = get_all_parsers()
        parser_titles = [parser.title for parser in parsers]
        self.assertIn("Test Parser", parser_titles)

    def test_get_all_embedders(self):
        """
        Test get_all_embedders function to ensure it returns all embedder classes.
        """
        embedders = get_all_embedders()
        embedder_titles = [embedder.title for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)

    def test_get_all_thumbnailers(self):
        """
        Test get_all_thumbnailers function to ensure it returns all thumbnail generator classes.
        """
        thumbnailers = get_all_thumbnailers()
        thumbnailer_titles = [thumbnailer.title for thumbnailer in thumbnailers]
        self.assertIn("Test Thumbnailer", thumbnailer_titles)

    def test_get_components_by_mimetype(self):
        """
        Test get_components_by_mimetype function to ensure it returns correct components for a given mimetype.
        """
        # Test with detailed=False
        components = get_components_by_mimetype("application/pdf", detailed=False)
        parsers = components.get("parsers", [])
        embedders = components.get("embedders", [])
        thumbnailers = components.get("thumbnailers", [])

        parser_titles = [parser.title for parser in parsers]
        embedder_titles = [embedder.title for embedder in embedders]
        thumbnailer_titles = [thumbnailer.title for thumbnailer in thumbnailers]

        self.assertIn("Test Parser", parser_titles)
        self.assertIn("Test Embedder", embedder_titles)
        self.assertIn("Test Thumbnailer", thumbnailer_titles)

        # Test with detailed=True
        components_detailed = get_components_by_mimetype(
            "application/pdf", detailed=True
        )
        parser_titles_detailed = [
            comp["title"] for comp in components_detailed["parsers"]
        ]
        embedder_titles_detailed = [
            comp["title"] for comp in components_detailed["embedders"]
        ]
        thumbnailer_titles_detailed = [
            comp["title"] for comp in components_detailed["thumbnailers"]
        ]

        self.assertIn("Test Parser", parser_titles_detailed)
        self.assertIn("Test Embedder", embedder_titles_detailed)
        self.assertIn("Test Thumbnailer", thumbnailer_titles_detailed)

    def test_get_metadata_for_component(self):
        """
        Test get_metadata_for_component function to ensure it returns correct metadata for a given component.
        """
        from opencontractserver.pipeline.parsers.test_parser import TestParser

        metadata = get_metadata_for_component(TestParser)
        self.assertEqual(metadata["title"], "Test Parser")
        self.assertEqual(metadata["description"], "A test parser for unit testing.")
        self.assertEqual(metadata["author"], "Test Author")
        self.assertEqual(metadata["dependencies"], [])
        self.assertEqual(metadata["supported_file_types"], [FileTypeEnum.PDF])

    def test_get_metadata_by_component_name(self):
        """
        Test get_metadata_by_component_name function to ensure it returns correct metadata when given a component name.
        """
        metadata = get_metadata_by_component_name("test_parser")
        self.assertEqual(metadata["title"], "Test Parser")
        self.assertEqual(metadata["description"], "A test parser for unit testing.")
        self.assertEqual(metadata["author"], "Test Author")
        self.assertEqual(metadata["dependencies"], [])
        self.assertEqual(metadata["supported_file_types"], [FileTypeEnum.PDF])

    def test_get_component_by_name(self):
        """
        Test get_component_by_name function to ensure it returns the correct class.
        """
        # Test parser component
        component = get_component_by_name("test_parser")
        from opencontractserver.pipeline.parsers.test_parser import TestParser

        self.assertEqual(component, TestParser)

        # Test embedder component
        component = get_component_by_name("test_embedder")
        from opencontractserver.pipeline.embedders.test_embedder import TestEmbedder

        self.assertEqual(component, TestEmbedder)

        # Test thumbnailer component
        component = get_component_by_name("test_thumbnailer")
        from opencontractserver.pipeline.thumbnailers.test_thumbnailer import (
            TestThumbnailer,
        )

        self.assertEqual(component, TestThumbnailer)

        # Test non-existing component
        with self.assertRaises(ValueError) as context:
            get_component_by_name("non_existing_component")
        self.assertTrue(
            "Component 'non_existing_component' not found." in str(context.exception)
        )


if __name__ == "__main__":
    unittest.main()
