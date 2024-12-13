import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from PIL import Image

from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import extract_thumbnail
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
)

User = get_user_model()

logger = logging.getLogger(__name__)


class ThumbnailTestCase(TestCase):
    """
    Test case for thumbnail-related tasks using extract_thumbnail.
    """

    def setUp(self) -> None:
        """
        Set up the test user and document for thumbnail tests.
        """
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_ONE_PATH.open("rb").read(), name="test.pdf"
        )
        pawls_file = ContentFile(
            SAMPLE_PAWLS_FILE_ONE_PATH.open("rb").read(), name="test.pawls"
        )

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="USC Title 1 - Chapter 1",
                custom_meta={},
                pdf_file=pdf_file,
                pawls_parse_file=pawls_file,
                backend_lock=True,
                file_type="application/pdf",
            )

    def create_mock_image(self, width: int, height: int) -> Image.Image:
        """
        Create a mock image with the given dimensions.

        Args:
            width (int): The width of the image.
            height (int): The height of the image.

        Returns:
            Image.Image: The created PIL Image object.
        """
        return Image.new("RGB", (width, height), color="red")

    @patch("opencontractserver.tasks.doc_tasks.import_function_from_string")
    def test_pdf_thumbnail_extraction(self, mock_import_function_from_string) -> None:
        """
        Test PDF thumbnail extraction with various image sizes and orientations.

        Args:
            mock_import_function_from_string (MagicMock): Mocked import_function_from_string function.
        """
        test_cases = [
            (400, 400, "square"),
            (600, 400, "landscape"),
            (400, 600, "portrait"),
        ]

        for width, height, orientation in test_cases:
            with self.subTest(orientation=orientation):
                # Mock the thumbnail extraction function
                def mock_pdf_thumbnail_function(file_bytes):
                    img = self.create_mock_image(width, height)
                    img_bytes = ContentFile(b"", name="icon.png")
                    img.save(img_bytes, format="PNG")
                    img_bytes.seek(0)
                    return img_bytes

                mock_import_function_from_string.return_value = (
                    mock_pdf_thumbnail_function
                )

                # Call the task
                extract_thumbnail(doc_id=self.doc.id)

                # Refresh the document from the database
                self.doc.refresh_from_db()

                # Check that the icon was created
                self.assertTrue(self.doc.icon, "Icon was not created.")

                # Open the saved image and check its properties
                with self.doc.icon.open("rb") as icon_file:
                    saved_image = Image.open(icon_file)

                    # Check the dimensions of the saved image
                    self.assertEqual(
                        saved_image.size,
                        (width, height),
                        "Image dimensions do not match expected size.",
                    )

                # Clean up
                self.doc.icon.delete()

    @patch("opencontractserver.tasks.doc_tasks.import_function_from_string")
    def test_txt_thumbnail_extraction(self, mock_import_function_from_string) -> None:
        """
        Test text thumbnail extraction.

        Args:
            mock_import_function_from_string (MagicMock): Mocked import_function_from_string function.
        """
        # Create a sample text content
        sample_text = "This is a sample text for thumbnail extraction."
        text_file = ContentFile(sample_text.encode("utf-8"), name="test_extract.txt")

        # Update the document with the text extract file and set file type
        self.doc.txt_extract_file = text_file
        self.doc.file_type = "application/txt"
        self.doc.save()

        # Mock the thumbnail extraction function
        def mock_txt_thumbnail_function(file_bytes):
            img = self.create_mock_image(100, 100)
            img_bytes = ContentFile(b"", name="icon.png")
            img.save(img_bytes, format="PNG")
            img_bytes.seek(0)
            return img_bytes

        mock_import_function_from_string.return_value = mock_txt_thumbnail_function

        # Call the task
        extract_thumbnail(doc_id=self.doc.id)

        # Refresh the document from the database
        self.doc.refresh_from_db()

        # Assert that the icon field is not empty
        self.assertTrue(self.doc.icon)
        self.assertIn("_icon.png", self.doc.icon.name)

        # Verify the content of the saved image
        with self.doc.icon.open("rb") as icon_file:
            saved_image = Image.open(icon_file)
            self.assertEqual(saved_image.size, (100, 100))
            self.assertEqual(saved_image.mode, "RGB")

        # Clean up
        self.doc.icon.delete()
        self.doc.txt_extract_file.delete()
