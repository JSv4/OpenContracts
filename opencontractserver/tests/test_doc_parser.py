#  Copyright (C) 2022  John Scrudato
import io
import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from PIL import Image

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import (
    burn_doc_annotations,
    convert_doc_to_funsd,
    extract_pdf_thumbnail,
    extract_txt_thumbnail,
    set_doc_lock_state,
)
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
)
from opencontractserver.types.enums import LabelType

User = get_user_model()

logger = logging.getLogger(__name__)


class DocParserTestCase(TestCase):
    def setUp(self):

        # Setup a test user ######################################################################
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
            )
            self.corpus = Corpus(
                title="Test", description="Some important stuff!", creator=self.user
            )
            self.corpus.save()

    def create_mock_image(self, width: int, height: int) -> Image.Image:
        """Create a mock image with the given dimensions."""
        return Image.new("RGB", (width, height), color="red")

    def image_to_bytes(self, image: Image.Image) -> bytes:
        """Convert a PIL Image to bytes."""
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format="PNG")
        return img_byte_arr.getvalue()

    @patch("opencontractserver.tasks.doc_tasks.convert_from_bytes")
    def test_pdf_thumbnail_extraction(self, mock_convert_from_bytes):
        """Test PDF thumbnail extraction with various image sizes and orientations."""

        test_cases = [
            (400, 400, "square"),
            (600, 400, "landscape"),
            (400, 600, "portrait"),
        ]

        for width, height, orientation in test_cases:
            with self.subTest(orientation=orientation):
                # Create a mock image
                mock_image = self.create_mock_image(width, height)
                mock_convert_from_bytes.return_value = [mock_image]

                # Call the task
                extract_pdf_thumbnail(doc_id=self.doc.id)

                # Refresh the document from the database
                self.doc.refresh_from_db()

                # Check that the icon was created
                self.assertTrue(self.doc.icon, "Icon was not created.")

                # Use assertRegex for better error messages
                self.assertRegex(
                    self.doc.icon.name,
                    r"\d+_icon_[a-zA-Z0-9]+\.jpg",
                    msg=f"Icon name '{self.doc.icon.name}' does not match the expected pattern.",
                )

                # Open the saved image and check its properties
                with self.doc.icon.open("rb") as icon_file:
                    saved_image = Image.open(icon_file)

                    # Check the dimensions of the saved image
                    self.assertEqual(
                        saved_image.size,
                        (400, 200),
                        "Image dimensions do not match expected size.",
                    )

                    # Check that the image is not empty (all white)
                    self.assertNotEqual(
                        saved_image.getcolors(),
                        [(400 * 200, (255, 255, 255))],
                        "Image appears to be empty or all white.",
                    )

                # Clean up
                self.doc.icon.delete()

    def test_set_doc_lock_state(self):
        set_doc_lock_state.apply(kwargs={"locked": True, "doc_id": self.doc.id}).get()

        self.doc.refresh_from_db()
        self.assertTrue(self.doc.backend_lock)

    def test_burn_doc_annotations(self):
        # TODO - handle text labels and do substantive test
        label_lookups = {
            "text_labels": {},
            "doc_labels": {
                "test": {
                    "id": "1234",
                    "color": "red",
                    "description": "stuff happening",
                    "icon": "tag",
                    "text": "test",
                    "label_type": LabelType.DOC_TYPE_LABEL,
                }
            },
        }
        result = burn_doc_annotations.apply(
            args=(label_lookups, self.doc.id, self.corpus.id)
        ).get()
        self.assertEqual(len(result), 5)

    def test_convert_doc_to_funsd(self):

        AnnotationLabel.objects.create(
            text="TestLabel", creator=self.user, label_type="TOKEN_LABEL"
        )
        Annotation.objects.create(
            raw_text="Test annotation",
            annotation_label=AnnotationLabel.objects.first(),
            document=self.doc,
            corpus_id=self.corpus.id,
            creator=self.user,
            json={
                "0": {
                    "tokensJsons": [],
                    "rawText": "Test",
                    "bounds": {"x": 0, "y": 0, "width": 10, "height": 10},
                }
            },
        )

        result = convert_doc_to_funsd.apply(args=(self.user.id, self.doc.id, 1)).get()

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], self.doc.id)
        self.assertIsInstance(result[1], dict)
        self.assertIsInstance(result[2], list)

    @patch("opencontractserver.tasks.doc_tasks.create_text_thumbnail")
    def test_extract_txt_thumbnail(self, mock_create_text_thumbnail):
        # Create a mock image
        mock_image = Image.new("RGB", (100, 100), color="red")
        mock_create_text_thumbnail.return_value = mock_image

        # Create a sample text content
        sample_text = "This is a sample text for thumbnail extraction."
        text_file = ContentFile(sample_text.encode("utf-8"), name="test_extract.txt")

        # Update the document with the text extract file
        self.doc.txt_extract_file = text_file
        self.doc.save()

        # Call the task
        extract_txt_thumbnail.apply(kwargs={"doc_id": self.doc.id}).get()

        # Refresh the document from the database
        self.doc.refresh_from_db()

        # Assert that the icon field is not empty
        self.assertTrue(self.doc.icon)
        self.assertIn("_icon.png", self.doc.icon.name)

        # Assert that create_text_thumbnail was called with the correct text
        mock_create_text_thumbnail.assert_called_once_with(sample_text)

        # Verify the content of the saved image
        with self.doc.icon.open("rb") as icon_file:
            saved_image = Image.open(icon_file)
            self.assertEqual(saved_image.size, (100, 100))
            self.assertEqual(saved_image.mode, "RGB")

        # Clean up
        self.doc.icon.delete()
        self.doc.txt_extract_file.delete()
