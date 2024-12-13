from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
import importlib
import os

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
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.parsers")
        )
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.embedders")
        )
        importlib.reload(
            importlib.import_module("opencontractserver.pipeline.thumbnailers")
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

        # Define the file paths for the components
        cls.parser_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'pipeline',
            'parsers',
            'test_parser.py'
        )
        cls.embedder_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'pipeline',
            'embedders',
            'test_embedder.py'
        )
        cls.thumbnailer_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'pipeline',
            'thumbnailers',
            'test_thumbnailer.py'
        )

        # Ensure package __init__.py files exist
        parser_init = os.path.join(os.path.dirname(cls.parser_path), '__init__.py')
        embedder_init = os.path.join(os.path.dirname(cls.embedder_path), '__init__.py')
        thumbnailer_init = os.path.join(os.path.dirname(cls.thumbnailer_path), '__init__.py')

        for init_file in [parser_init, embedder_init, thumbnailer_init]:
            if not os.path.exists(init_file):
                with open(init_file, 'w'):
                    pass  # Create empty __init__.py

        # Create the test component files
        os.makedirs(os.path.dirname(cls.parser_path), exist_ok=True)
        with open(cls.parser_path, 'w') as f:
            f.write(cls.parser_code)
        cls.test_files.append(cls.parser_path)

        os.makedirs(os.path.dirname(cls.embedder_path), exist_ok=True)
        with open(cls.embedder_path, 'w') as f:
            f.write(cls.embedder_code)
        cls.test_files.append(cls.embedder_path)

        os.makedirs(os.path.dirname(cls.thumbnailer_path), exist_ok=True)
        with open(cls.thumbnailer_path, 'w') as f:
            f.write(cls.thumbnailer_code)
        cls.test_files.append(cls.thumbnailer_path)

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
        query = '''
        query {
            pipelineComponents {
                parsers {
                    name
                    title
                    description
                    author
                    supportedFileTypes
                    componentType
                }
                embedders {
                    name
                    title
                    description
                    author
                    vectorSize
                    supportedFileTypes
                    componentType
                }
                thumbnailers {
                    name
                    title
                    description
                    author
                    supportedFileTypes
                    componentType
                }
            }
        }
        '''

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))

        data = result["data"]["pipelineComponents"]
        parsers = data["parsers"]
        embedders = data["embedders"]
        thumbnailers = data["thumbnailers"]

        parser_names = [parser['name'] for parser in parsers]
        embedder_names = [embedder['name'] for embedder in embedders]
        thumbnailer_names = [thumbnailer['name'] for thumbnailer in thumbnailers]

        self.assertIn("TestParser", parser_names)
        self.assertIn("TestEmbedder", embedder_names)
        self.assertIn("TestThumbnailer", thumbnailer_names)

    def test_pipeline_components_query_with_mimetype(self):
        """Test querying pipeline components filtered by mimetype."""
        query = '''
        query($mimetype: FileTypeEnum) {
            pipelineComponents(mimetype: $mimetype) {
                parsers {
                    name
                    title
                    supportedFileTypes
                    componentType
                }
                embedders {
                    name
                    title
                    supportedFileTypes
                    componentType
                }
                thumbnailers {
                    name
                    title
                    supportedFileTypes
                    componentType
                }
            }
        }
        '''

        variables = {
            'mimetype': 'PDF'
        }

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        data = result["data"]["pipelineComponents"]
        parsers = data["parsers"]
        embedders = data["embedders"]
        thumbnailers = data["thumbnailers"]

        # Since our test components support PDF, they should be included
        parser_titles = [parser['title'] for parser in parsers]
        thumbnailer_titles = [thumbnailer['title'] for thumbnailer in thumbnailers]

        self.assertIn("Test Parser", parser_titles)
        self.assertIn("Test Thumbnailer", thumbnailer_titles)

        # Embedders are not filtered by mimetype in our implementation
        embedder_titles = [embedder['title'] for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)

    def test_pipeline_components_query_with_mimetype_no_components(self):
        """Test querying pipeline components with a mimetype that has no components."""

        # Assuming "DOCX" is not a supported file type for our test components
        query = '''
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
        '''

        variables = {
            'mimetype': 'DOCX'  # Our test components do not support DOCX
        }

        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))

        data = result["data"]["pipelineComponents"]
        self.assertEqual(len(data["parsers"]), 0)
        self.assertEqual(len(data["thumbnailers"]), 0)

        # Embedders are included regardless of mimetype in our utils
        embedders = data["embedders"]
        # Our test embedder should be included
        embedder_titles = [embedder['title'] for embedder in embedders]
        self.assertIn("Test Embedder", embedder_titles)
