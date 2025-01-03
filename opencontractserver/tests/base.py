import os
import shutil
from pathlib import Path
from typing import ClassVar

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.db.models.signals import post_save
from django.db.utils import OperationalError
from django.test import TransactionTestCase, override_settings

from opencontractserver.annotations.models import Annotation
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import process_doc_on_create_atomic

User = get_user_model()


@pytest.mark.django_db
@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT="test_media/",
    CELERY_TASK_ALWAYS_EAGER=True,
)
class BaseFixtureTestCase(TransactionTestCase):
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
    def _terminate_other_connections(cls) -> None:
        """
        Force-terminate any extra sessions connected to the test database so there are
        no lingering connections that block teardown or DB deletion.

        This is especially useful if Celery or other threads opened extra connections.
        """
        from django.conf import settings
        from django.db import connection

        db_name = settings.DATABASES["default"]["NAME"]
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE pid <> pg_backend_pid()
                  AND datname = %s;
                """,
                [db_name],
            )

    @classmethod
    def setUpClass(cls) -> None:
        """Set up test class with patched signals."""
        # Create test media directory if it doesn't exist
        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

        # Disconnect signals before loading fixtures
        post_save.disconnect(process_doc_on_create_atomic, sender=Document)
        post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)

        # Close any existing connections before setup
        for conn in connections.all():
            conn.close()

        super().setUpClass()

    def _pre_setup(self):
        """Additional setup before each test method."""
        # Close any lingering connections
        for conn in connections.all():
            conn.close()
        super()._pre_setup()

    def _post_teardown(self):
        """Additional cleanup after each test method."""
        super()._post_teardown()
        # Close connections after each test
        for conn in connections.all():
            conn.close()

    @classmethod
    def tearDownClass(cls) -> None:
        """
        Clean up signal patches, test media, and database connections.

        Overridden to ensure that any leftover connections (e.g., from Celery tasks)
        are completely closed before Django attempts to destroy the test database.
        """
        try:
            # Ensure no other connections remain before DB teardown.
            cls._terminate_other_connections()

            # Close all database connections before teardown.
            for conn in connections.all():
                conn.close_if_unusable_or_obsolete()
                conn.close()

            # Force close the default connection.
            connection.close()

            try:
                super().tearDownClass()
            except OperationalError as e:
                # If the DB can't be deleted because of external connections, warn but do not raise.
                if "database is being accessed by other users" in str(e):
                    print(
                        "Warning: Could not delete test database (in use by other connections)."
                    )
                else:
                    raise
        finally:
            # Reconnect signals, clean up test media, and close connections.
            post_save.connect(process_doc_on_create_atomic, sender=Document)
            post_save.connect(process_annot_on_create_atomic, sender=Annotation)

            if os.path.exists(settings.MEDIA_ROOT):
                shutil.rmtree(settings.MEDIA_ROOT)

            for conn in connections.all():
                conn.close()
            connection.close()

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
        with open(src, "rb") as f:
            file_contents = f.read()

        with open(dest, "wb") as f:
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
