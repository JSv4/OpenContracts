import importlib
import os

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client

from config.graphql.schema import schema

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class PipelineComponentQueriesTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Dynamically create test components
        cls.test_files = []
        cls.create_test_components()

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
        # Remove the test components
        cls.remove_test_components()
        super().tearDownClass()

    @classmethod
    def create_test_components(cls):
        """Creates test pipeline components by writing files to appropriate directories."""
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
        return [0.0] * self.vector_size
'''

        cls.thumbnailer_code = '''
from opencontractserver.pipeline.base.thumbnailer import BaseThumbnailGenerator
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from typing import Optional, List
from django.core.files.base import ContentFile

class TestThumbnailer(BaseThumbnailGenerator):
    """
    A test thumbnail generator for unit testing.
    """

    title: str = "Test Thumbnailer"
    description: str = "A test thumbnailer for unit testing."
    author: str = "Test Author"
    dependencies: List[str] = []
    supported_file_types: List[FileTypeEnum] = [FileTypeEnum.PDF]

    def generate_thumbnail(self, file_bytes: bytes) -> Optional[ContentFile]:
        return None
'''

        cls.post_processor_code = '''
from opencontractserver.pipeline.base.post_processor import BasePostProcessor
from typing import Tuple, Optional, List
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.dicts import OpenContractsExportDataJsonPythonType

class TestPostProcessor(BasePostProcessor):
    """
    A test post-processor for unit testing.
    """

    title: str = "Test Post Processor"
    description: str = "A test post-processor for unit testing."
    author: str = "Test Author"
    dependencies: list[str] = []
    supported_file_types: List[FileTypeEnum] = [FileTypeEnum.PDF]

    def process_export(
        self,
        zip_bytes: bytes,
        export_data: OpenContractsExportDataJsonPythonType,
    ) -> Tuple[bytes, OpenContractsExportDataJsonPythonType]:
        return zip_bytes, export_data
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

        # Ensure package __init__.py files exist
        parser_init = os.path.join(os.path.dirname(cls.parser_path), "__init__.py")
        embedder_init = os.path.join(os.path.dirname(cls.embedder_path), "__init__.py")
        thumbnailer_init = os.path.join(
            os.path.dirname(cls.thumbnailer_path), "__init__.py"
        )
        post_processor_init = os.path.join(
            os.path.dirname(cls.post_processor_path), "__init__.py"
        )

        for init_file in [
            parser_init,
            embedder_init,
            thumbnailer_init,
            post_processor_init,
        ]:
            if not os.path.exists(init_file):
                with open(init_file, "w"):
                    pass  # Create empty __init__.py

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

        # Create the post processor file
        os.makedirs(os.path.dirname(cls.post_processor_path), exist_ok=True)
        with open(cls.post_processor_path, "w") as f:
            f.write(cls.post_processor_code)
        cls.test_files.append(cls.post_processor_path)

    @classmethod
    def remove_test_components(cls):
        """Removes the test component files."""
        for file_path in cls.test_files:
            if os.path.exists(file_path):
                os.remove(file_path)
        cls.test_files = []

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

    def test_pipeline_components_query(self):
        """Test querying all pipeline components without any filters."""
        query = """
        query {
            pipelineComponents {
                parsers {
                    name
                    title
                    description
                    author
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                embedders {
                    name
                    title
                    description
                    author
                    vectorSize
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                thumbnailers {
                    name
                    title
                    description
                    author
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                postProcessors {
                    name
                    title
                    description
                    author
                    componentType
                    inputSchema
                }
            }
        }
        """

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))

        print(f"Query result: {result['data']}")

        data = result["data"]["pipelineComponents"]
        parsers = data["parsers"]
        embedders = data["embedders"]
        thumbnailers = data["thumbnailers"]
        post_processors = data["postProcessors"]

        parser_names = [parser["name"] for parser in parsers]
        embedder_names = [embedder["name"] for embedder in embedders]
        thumbnailer_names = [thumbnailer["name"] for thumbnailer in thumbnailers]
        post_processor_names = [pp["name"] for pp in post_processors]

        self.assertIn("TestParser", parser_names)
        self.assertIn("TestEmbedder", embedder_names)
        self.assertIn("TestThumbnailer", thumbnailer_names)
        self.assertIn("TestPostProcessor", post_processor_names)

    def test_pipeline_components_query_with_mimetype(self):
        """Test querying pipeline components filtered by mimetype."""
        query = """
        query($mimetype: FileTypeEnum) {
            pipelineComponents(mimetype: $mimetype) {
                parsers {
                    name
                    title
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                embedders {
                    name
                    title
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                thumbnailers {
                    name
                    title
                    supportedFileTypes
                    componentType
                    inputSchema
                }
                postProcessors {
                    name
                    title
                    description
                    author
                    componentType
                    inputSchema
                }
            }
        }
        """

        variables = {"mimetype": "PDF"}

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        data = result["data"]["pipelineComponents"]
        print(f"test_pipeline_components_query_with_mimetype - Data: {data}")
        parsers = data["parsers"]
        embedders = data["embedders"]
        thumbnailers = data["thumbnailers"]
        post_processors = data["postProcessors"]

        # Since our test components support PDF, they should be included
        parser_titles = [parser["title"] for parser in parsers]
        thumbnailer_titles = [thumbnailer["title"] for thumbnailer in thumbnailers]

        self.assertIn("Test Parser", parser_titles)
        self.assertIn("Test Thumbnailer", thumbnailer_titles)

        # Embedders are not filtered by mimetype in our implementation
        embedder_titles = [embedder["title"] for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)

        post_processor_titles = [pp["title"] for pp in post_processors]
        print(f"Post processor titles: {post_processor_titles}")
        self.assertIn("Test PostProcessor", post_processor_titles)

    def test_pipeline_components_query_with_mimetype_no_components(self):
        """Test querying pipeline components with a mimetype that has no components."""

        # Assuming "DOCX" is not a supported file type for our test components
        query = """
        query($mimetype: FileTypeEnum) {
            pipelineComponents(mimetype: $mimetype) {
                parsers {
                    name
                    title
                }
                embedders {
                    name
                    title
                }
                thumbnailers {
                    name
                    title
                }
            }
        }
        """

        variables = {"mimetype": "DOCX"}  # Our test components do not support DOCX

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        data = result["data"]["pipelineComponents"]
        self.assertEqual(len(data["parsers"]), 0)
        self.assertEqual(len(data["thumbnailers"]), 0)

        # Embedders are included regardless of mimetype in our utils
        embedders = data["embedders"]
        # Our test embedder should be included
        embedder_titles = [embedder["title"] for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)
