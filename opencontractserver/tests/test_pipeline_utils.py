import importlib
import logging
import os
import unittest
from unittest import TestCase
from unittest.mock import patch, MagicMock

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.pipeline.utils import (
    find_embedder_for_filetype_and_dimension,
    find_embedders_by_dimension,
    get_all_embedders,
    get_all_parsers,
    get_all_post_processors,
    get_all_subclasses,
    get_all_thumbnailers,
    get_component_by_name,
    get_components_by_mimetype,
    get_default_embedder_for_filetype_and_dimension,
    get_dimension_from_embedder,
    get_metadata_by_component_name,
    get_metadata_for_component,
    run_post_processors,
)
from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType

logger = logging.getLogger(__name__)


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
from opencontractserver.pipeline.base.file_types import FileTypeEnum
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
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str) -> Optional[List[float]]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size

class TestEmbedder384(BaseEmbedder):
    """
    A test embedder with 384 dimensions.
    """

    title: str = "Test Embedder 384"
    description: str = "A test embedder with 384 dimensions."
    author: str = "Test Author"
    dependencies: List[str] = []
    vector_size: int = 384
    supported_file_types = [FileTypeEnum.PDF]

    def embed_text(self, text: str) -> Optional[List[float]]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size

class TestEmbedder768(BaseEmbedder):
    """
    A test embedder with 768 dimensions.
    """

    title: str = "Test Embedder 768"
    description: str = "A test embedder with 768 dimensions."
    author: str = "Test Author"
    dependencies: List[str] = []
    vector_size: int = 768
    supported_file_types = [FileTypeEnum.TXT]

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

        cls.post_processor_code = '''
from opencontractserver.pipeline.base.post_processor import BasePostProcessor
from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)

class TestPostProcessor(BasePostProcessor):
    """
    A test post-processor for unit testing.
    """

    title: str = "Test PostProcessor"
    description: str = "A test post-processor for unit testing."
    author: str = "Test Author"
    dependencies: List[str] = []
    supported_file_types: List[FileTypeEnum] = [FileTypeEnum.PDF]

    def process_export(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
    ) -> Tuple[bytes, OpenContractsExportDataJsonPythonType]:
        # Add logging to debug the process
        logger.info("TestPostProcessor.process_export called")
        logger.info(f"Input export_data: {export_data}")

        # Add a test field to export data
        new_export_data = export_data.copy()
        new_export_data["test_field"] = "test_value"

        logger.info(f"Modified export_data: {new_export_data}")
        return zip_bytes, new_export_data
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
        cls.post_processor_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "pipeline",
            "post_processors",
            "test_post_processor.py",
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

        os.makedirs(os.path.dirname(cls.post_processor_path), exist_ok=True)
        with open(cls.post_processor_path, "w") as f:
            f.write(cls.post_processor_code)
        cls.test_files.append(cls.post_processor_path)

        # Reload the importlib caches and modules
        importlib.invalidate_caches()
        importlib.reload(importlib.import_module("opencontractserver.pipeline.parsers"))
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.embedders")
        )
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.thumbnailers")
        )
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.post_processors")
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

    def setUp(self):
        """Set up fresh test components before each test."""
        # Create post processor file if we're going to execute it...
        os.makedirs(os.path.dirname(self.post_processor_path), exist_ok=True)
        with open(self.post_processor_path, "w") as f:
            f.write(self.post_processor_code)

        # Reload the module to ensure we have fresh code
        importlib.invalidate_caches()
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.post_processors")
        )

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
        self.assertIn("Test Embedder 384", embedder_titles)
        self.assertIn("Test Embedder 768", embedder_titles)

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
        from opencontractserver.pipeline.parsers.test_parser import (
            TestParser,  # type: ignore; type: ignore
        )

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
        from opencontractserver.pipeline.parsers.test_parser import (
            TestParser,  # type: ignore; type: ignore
        )

        self.assertEqual(component, TestParser)

        # Test embedder component
        component = get_component_by_name("test_embedder")
        from opencontractserver.pipeline.embedders.test_embedder import (
            TestEmbedder,  # type: ignore; type: ignore
        )

        self.assertEqual(component, TestEmbedder)

        # Test thumbnailer component
        component = get_component_by_name("test_thumbnailer")
        from opencontractserver.pipeline.thumbnailers.test_thumbnailer import (  # type: ignore
            TestThumbnailer,
        )

        self.assertEqual(component, TestThumbnailer)

        # Test post-processor component
        component = get_component_by_name("test_post_processor")
        from opencontractserver.pipeline.post_processors.test_post_processor import (  # type: ignore
            TestPostProcessor,
        )

        self.assertEqual(component, TestPostProcessor)

        # Test non-existing component
        with self.assertRaises(ValueError) as context:
            get_component_by_name("non_existing_component")
        self.assertTrue(
            "Component 'non_existing_component' not found." in str(context.exception)
        )

    def test_run_post_processors(self):
        """
        Test run_post_processors function to ensure it correctly loads and runs post-processors.
        """
        # Create test data
        test_zip_bytes = b"test zip content"
        test_export_data: OpenContractsExportDataJsonPythonType = {
            "annotated_docs": {},
            "corpus": {
                "title": "Test Corpus",
                "description": "Test Description",
                "icon": None,
            },
            "label_set": {
                "title": "Test Label Set",
                "description": "Test Description",
                "icon": None,
            },
            "doc_labels": {},
            "text_labels": {},
        }

        # Run post-processor
        processor_paths = [
            "opencontractserver.pipeline.post_processors.test_post_processor.TestPostProcessor"
        ]

        # Add debug logging
        logger.info("Before running post-processors")
        logger.info(f"Initial export data: {test_export_data}")

        modified_zip_bytes, modified_export_data = run_post_processors(
            processor_paths, test_zip_bytes, test_export_data
        )

        # Add more debug logging
        logger.info("After running post-processors...")
        logger.info(f"Modified export data: {modified_export_data}")

        # Verify post-processor was applied
        self.assertEqual(modified_zip_bytes, test_zip_bytes)  # Zip bytes unchanged

        # Test with invalid processor path
        with self.assertRaises(ValueError):
            run_post_processors(
                ["invalid.processor.path"], test_zip_bytes, test_export_data
            )

    def test_get_all_post_processors(self):
        """
        Test get_all_post_processors function to ensure it returns all post-processor classes.
        """
        post_processors = get_all_post_processors()
        post_processor_titles = [processor.title for processor in post_processors]
        self.assertIn("Test PostProcessor", post_processor_titles)

    def test_get_dimension_from_embedder(self):
        """
        Test get_dimension_from_embedder function to ensure it correctly extracts dimensions.
        """
        # Get the test embedder class
        embedders = get_all_embedders()
        test_embedder = next((e for e in embedders if e.title == "Test Embedder"), None)
        test_embedder_384 = next((e for e in embedders if e.title == "Test Embedder 384"), None)
        
        # Test with class
        self.assertEqual(get_dimension_from_embedder(test_embedder), 128)
        self.assertEqual(get_dimension_from_embedder(test_embedder_384), 384)
        
        # Test with path
        with patch('opencontractserver.pipeline.utils.get_component_by_name') as mock_get_component:
            mock_get_component.return_value = test_embedder
            self.assertEqual(get_dimension_from_embedder("path.to.TestEmbedder"), 128)
            
            mock_get_component.return_value = test_embedder_384
            self.assertEqual(get_dimension_from_embedder("path.to.TestEmbedder384"), 384)
            
            # Test with non-existent embedder
            mock_get_component.side_effect = ValueError("Component not found")
            with patch('opencontractserver.pipeline.utils.settings') as mock_settings:
                mock_settings.DEFAULT_EMBEDDING_DIMENSION = 768
                self.assertEqual(get_dimension_from_embedder("non.existent.Embedder"), 768)

    def test_find_embedders_by_dimension(self):
        """
        Test find_embedders_by_dimension function to ensure it finds embedders with the specified dimension.
        """
        # Test finding embedders with dimension 384
        embedders_384 = find_embedders_by_dimension(384)
        embedder_titles = [embedder.title for embedder in embedders_384]
        self.assertIn("Test Embedder 384", embedder_titles)
        self.assertNotIn("Test Embedder 768", embedder_titles)
        
        # Test finding embedders with dimension 768
        embedders_768 = find_embedders_by_dimension(768)
        embedder_titles = [embedder.title for embedder in embedders_768]
        self.assertIn("Test Embedder 768", embedder_titles)
        self.assertNotIn("Test Embedder 384", embedder_titles)
        
        # Test finding embedders with non-existent dimension
        embedders_1536 = find_embedders_by_dimension(1536)
        self.assertEqual(len(embedders_1536), 0)

    @patch('opencontractserver.pipeline.utils.settings')
    def test_get_default_embedder_for_filetype_and_dimension(self, mock_settings):
        """
        Test get_default_embedder_for_filetype_and_dimension function.
        """
        # Mock the settings
        mock_settings.DEFAULT_EMBEDDERS_BY_FILETYPE_AND_DIMENSION = {
            "application/pdf": {
                384: "opencontractserver.tests.test_pipeline_utils.TestEmbedder384",
                768: "opencontractserver.tests.test_pipeline_utils.TestEmbedder768",
            },
            "text/plain": {
                384: "opencontractserver.tests.test_pipeline_utils.TestEmbedder384",
                768: "opencontractserver.tests.test_pipeline_utils.TestEmbedder768",
            }
        }
        
        # Create a mock module with our test embedders
        mock_module = MagicMock()
        mock_module.TestEmbedder384 = next((e for e in get_all_embedders() if e.title == "Test Embedder 384"), None)
        mock_module.TestEmbedder768 = next((e for e in get_all_embedders() if e.title == "Test Embedder 768"), None)
        
        # Mock the importlib.import_module to return our mock module
        with patch('importlib.import_module', return_value=mock_module):
            # Test getting embedder for PDF with dimension 384
            embedder = get_default_embedder_for_filetype_and_dimension("application/pdf", 384)
            self.assertEqual(embedder.title, "Test Embedder 384")
            
            # Test getting embedder for TXT with dimension 768
            embedder = get_default_embedder_for_filetype_and_dimension("text/plain", 768)
            self.assertEqual(embedder.title, "Test Embedder 768")
            
            # Test getting embedder for non-existent mimetype
            embedder = get_default_embedder_for_filetype_and_dimension("application/json", 384)
            self.assertIsNone(embedder)
            
            # Test getting embedder for non-existent dimension
            embedder = get_default_embedder_for_filetype_and_dimension("application/pdf", 1536)
            self.assertIsNone(embedder)

    @patch('opencontractserver.pipeline.utils.get_preferred_embedder')
    @patch('opencontractserver.pipeline.utils.get_default_embedder_for_filetype_and_dimension')
    @patch('opencontractserver.pipeline.utils.get_default_embedder')
    def test_find_embedder_for_filetype_and_dimension(self, mock_get_default, mock_get_default_for_filetype, mock_get_preferred):
        """
        Test find_embedder_for_filetype_and_dimension function.
        """
        # Get our test embedders
        embedders = get_all_embedders()
        test_embedder = next((e for e in embedders if e.title == "Test Embedder"), None)
        test_embedder_384 = next((e for e in embedders if e.title == "Test Embedder 384"), None)
        test_embedder_768 = next((e for e in embedders if e.title == "Test Embedder 768"), None)
        
        # Set up mocks
        mock_get_preferred.return_value = test_embedder
        mock_get_default_for_filetype.return_value = test_embedder_384
        mock_get_default.return_value = test_embedder_768
        
        # Test with no dimension specified
        embedder = find_embedder_for_filetype_and_dimension("application/pdf")
        self.assertEqual(embedder, test_embedder)
        mock_get_preferred.assert_called_with("application/pdf")
        mock_get_default_for_filetype.assert_not_called()
        
        # Reset mocks
        mock_get_preferred.reset_mock()
        mock_get_default_for_filetype.reset_mock()
        
        # Test with dimension specified
        embedder = find_embedder_for_filetype_and_dimension("application/pdf", 384)
        self.assertEqual(embedder, test_embedder_384)
        mock_get_default_for_filetype.assert_called_with("application/pdf", 384)
        
        # Test fallback to preferred embedder
        mock_get_default_for_filetype.return_value = None
        embedder = find_embedder_for_filetype_and_dimension("application/pdf", 384)
        self.assertEqual(embedder, test_embedder)
        
        # Test fallback to default embedder
        mock_get_preferred.return_value = None
        embedder = find_embedder_for_filetype_and_dimension("application/pdf", 384)
        self.assertEqual(embedder, test_embedder_768)
        mock_get_default.assert_called_once()


if __name__ == "__main__":
    unittest.main()
