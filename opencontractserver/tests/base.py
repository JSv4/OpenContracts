from typing import ClassVar
import os
import shutil
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.signals import post_save
import pytest

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.documents.models import Document
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.documents.signals import process_doc_on_create_atomic
from django.contrib.auth import get_user_model

User = get_user_model()

@pytest.mark.django_db
@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT="test_media/",
    CELERY_TASK_ALWAYS_EAGER=True,
)
class BaseFixtureTestCase(TestCase):
    """
    Base test case that loads fixtures and disables signals.
    
    This test case:
    1. Loads the test fixtures automatically
    2. Disables document and annotation processing signals
    3. Provides helper methods to access test data
    4. Handles file field storage and cleanup
    """
    
    fixtures: ClassVar[list[str]] = ["opencontractserver/tests/fixtures/test_data.json"]
    
    @classmethod
    def setUpClass(cls) -> None:
        """Set up test class with patched signals."""
        # Create test media directory if it doesn't exist
        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
        
        # Disconnect signals before loading fixtures
        post_save.disconnect(process_doc_on_create_atomic, sender=Document)
        post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)
        
        super().setUpClass()
    
    @classmethod
    def tearDownClass(cls) -> None:
        """Clean up signal patches and test media."""
        super().tearDownClass()
        
        # Reconnect signals
        post_save.connect(process_doc_on_create_atomic, sender=Document)
        post_save.connect(process_annot_on_create_atomic, sender=Annotation)
        
        # Clean up test media directory
        if os.path.exists(settings.MEDIA_ROOT):
            shutil.rmtree(settings.MEDIA_ROOT)
    
    def copy_fixture_file(self, fixture_path: str, dest_path: str) -> None:
        """
        Copy a file from fixtures to the test media directory.
        
        Args:
            fixture_path: Path relative to fixtures directory
            dest_path: Destination path in test media directory
        """
        # Remove any extra 'fixtures/' prefix since files are already in fixtures dir
        if fixture_path.startswith("fixtures/"):
            fixture_path = fixture_path.replace("fixtures/", "", 1)
            
        src = Path("opencontractserver/tests/fixtures") / fixture_path
        dest = Path(settings.MEDIA_ROOT) / dest_path
        
        # Create destination directory if it doesn't exist
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        
        # Read source file and create a new file in test media
        with open(src, 'rb') as f:
            file_contents = f.read()
            
        with open(dest, 'wb') as f:
            f.write(file_contents)
    
    def setUp(self) -> None:
        """Set up test instance with commonly needed objects."""
        super().setUp()
        
        # Cache commonly needed objects
        self.user = User.objects.get(username="testuser")
        
        # Get all documents
        self.docs = list(Document.objects.all().order_by("id"))
        self.doc = self.docs[0]  # First doc
        self.doc2 = self.docs[1]  # Second doc
        self.doc3 = self.docs[2]  # Third doc
        
        # For each document, copy its files from fixtures to test media
        for doc in self.docs:
            # Handle each file field
            for field in ["pdf_file", "txt_extract_file", "pawls_parse_file", "icon"]:
                file_field = getattr(doc, field)
                if file_field:
                    file_path = file_field.name
                    # If the path starts with fixtures/, it's a fixture file
                    if file_path.startswith("fixtures/"):
                        # Copy from fixtures to test media, removing the fixtures/ prefix
                        media_path = file_path.replace("fixtures/", "", 1)
                        self.copy_fixture_file(file_path, media_path)
                        # Update the file field to point to the new location
                        setattr(doc, field, media_path)
            doc.save() 