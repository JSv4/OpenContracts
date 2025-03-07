import logging
import os
import shutil
import time
from pathlib import Path
from typing import ClassVar

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, connections
from django.db.models.signals import post_save
from django.db.utils import OperationalError
from django.test import TransactionTestCase, override_settings
from graphql_jwt.shortcuts import get_token

from config.asgi import application
from opencontractserver.annotations.models import Annotation
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import process_doc_on_create_atomic

User = get_user_model()
logger = logging.getLogger(__name__)


@pytest.mark.django_db
@override_settings(
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
    MEDIA_ROOT="test_media/",
    CELERY_TASK_ALWAYS_EAGER=True,
)
class BaseFixtureTestCase(TransactionTestCase):
    """
    Base test case that loads fixtures using natural keys and disables signals.

    This test case:
    1. Loads the test fixtures automatically (split into contenttypes and test_data).
    2. Disables document and annotation processing signals.
    3. Provides helper methods to access test data.
    4. Handles file field storage and cleanup.
    """

    fixtures: ClassVar[list[str]] = [
        "opencontractserver/tests/fixtures/test_data.json",
    ]

    @classmethod
    def _terminate_other_connections(cls) -> None:
        """
        Force-terminate any extra sessions connected to the test database so there are
        no lingering connections that block teardown or DB deletion.
        """
        db_name = settings.DATABASES["default"]["NAME"]
        with connection.cursor() as cursor:
            logger.info(f"Terminating stale DB connections for DB: {db_name}")
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid();
                """,
                [db_name],
            )
            count = cursor.fetchone()[0]
            logger.info(f"Found {count} other connections to {db_name}")

            if count > 0:
                cursor.execute(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE pid <> pg_backend_pid()
                      AND datname = %s;
                    """,
                    [db_name],
                )
                logger.info(f"Terminated {count} connections to {db_name}")

    @classmethod
    def setUpClass(cls) -> None:
        """
        Set up test class with patched signals.
        Also closes any lingering DB connections before continuing.
        """
        os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

        # Disconnect signals before loading fixtures
        post_save.disconnect(process_doc_on_create_atomic, sender=Document)
        post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)

        # Close any existing connections before setup
        for conn in connections.all():
            conn.close()

        super().setUpClass()

    def _pre_setup(self):
        """
        Additional setup before each test method, which includes ensuring
        no stale database connections remain.
        """
        for conn in connections.all():
            conn.close()
        super()._pre_setup()

    def _post_teardown(self):
        """
        Additional teardown after each test method, ensuring connections
        are closed.
        """
        super()._post_teardown()
        for conn in connections.all():
            conn.close()

    @classmethod
    def tearDownClass(cls) -> None:
        """
        Clean up signal patches, test media, and database connections.
        """
        try:
            # First, just close connections normally without terminating
            for conn in connections.all():
                conn.close_if_unusable_or_obsolete()
                conn.close()
            connection.close()

            # Try the parent teardown without forcibly terminating connections
            try:
                super().tearDownClass()
            except OperationalError as e:
                if "database is being accessed by other users" in str(e):
                    logger.warning(
                        "Warning: Could not delete test database (in use by other connections)."
                    )

                    # Only now, as a last resort, terminate connections
                    time.sleep(2)  # Give any in-progress operations time to finish
                    cls._terminate_other_connections()

                    # Try again with super teardown
                    try:
                        super().tearDownClass()
                    except OperationalError:
                        logger.warning(
                            "Still could not delete test database after terminating connections."
                        )
                else:
                    raise
        finally:
            # Reconnect signals and clean up the filesystem
            post_save.connect(process_doc_on_create_atomic, sender=Document)
            post_save.connect(process_annot_on_create_atomic, sender=Annotation)

            if os.path.exists(settings.MEDIA_ROOT):
                shutil.rmtree(settings.MEDIA_ROOT)

    def copy_fixture_file(self, fixture_path: str, dest_path: str) -> None:
        """
        Copy a file from fixtures to the test media directory.

        Args:
            fixture_path: Path relative to the 'files' directory in 'opencontractserver/tests/fixtures'
            dest_path: Destination path in test media directory
        """
        # If the fixture path starts with "files/", remove that portion so we can build the local path
        if fixture_path.startswith("files/"):
            fixture_path = fixture_path.replace("files/", "", 1)

        src = Path("opencontractserver/tests/fixtures/files") / fixture_path
        dest = Path(settings.MEDIA_ROOT) / dest_path

        os.makedirs(os.path.dirname(dest), exist_ok=True)

        with open(src, "rb") as f:
            file_contents = f.read()

        with open(dest, "wb") as f:
            f.write(file_contents)

    def setUp(self) -> None:
        """
        Set up test instance with commonly needed objects, including user
        and any documents that were loaded in the fixtures.
        """
        super().setUp()

        self.user = User.objects.get(username="testuser")

        self.docs = list(Document.objects.all().order_by("id"))
        if not self.docs:
            return

        self.doc = self.docs[0]
        if len(self.docs) > 1:
            self.doc2 = self.docs[1]
        if len(self.docs) > 2:
            self.doc3 = self.docs[2]

        # Copy fixture files from the fixture paths to the test-specific media folder
        for doc in self.docs:
            for field in ["pdf_file", "txt_extract_file", "pawls_parse_file", "icon"]:
                file_field = getattr(doc, field)
                if file_field:
                    file_path = file_field.name
                    # Check for the "files/" prefix in case it's present
                    if file_path.startswith("files/"):
                        # Strip off the "files/" portion and copy to MEDIA_ROOT
                        media_path = file_path.replace("files/", "", 1)
                        self.copy_fixture_file(file_path, media_path)
                        setattr(doc, field, media_path)
            doc.save()

        self.corpus = Corpus.objects.create(
            title="Test Corpus", creator=self.user, backend_lock=False
        )


class WebsocketFixtureBaseTestCase(BaseFixtureTestCase):
    """
    Inherits from BaseFixtureTestCase to load fixtures (test_data.json) and
    provide a realistic set of data for WebSocket tests. This ensures that
    we have a user named 'testuser' and at least one Document from the fixtures.
    """

    def setUp(self) -> None:
        """
        Hooks into the BaseFixtureTestCase setUp, which loads a user (self.user)
        and any documents (self.doc, self.docs, etc.) from the fixture.
        We then create a token for the fixture user.
        """
        super().setUp()
        self.token = get_token(user=self.user)
        self.application = application


class CeleryEagerModeTestCase(TransactionTestCase):
    """
    Base test case for tests that use Celery's eager mode.

    This test case ensures that database connections are properly managed
    when running Celery tasks in eager mode during tests.
    """

    def setUp(self):
        super().setUp()
        # Ensure we have a fresh connection before each test
        for alias in connections:
            connections[alias].close()
            connections[alias].connect()

    def tearDown(self):
        # Close connections after each test to prevent them from being terminated
        # while still in use
        for alias in connections:
            connections[alias].close()
        super().tearDown()


class CeleryEagerModeFixtureTestCase(BaseFixtureTestCase, CeleryEagerModeTestCase):
    """
    Combines BaseFixtureTestCase with CeleryEagerModeTestCase.

    Use this for tests that need both fixtures and Celery eager mode.
    """

    def setUp(self):
        # Call both parent setUp methods
        BaseFixtureTestCase.setUp(self)
        CeleryEagerModeTestCase.setUp(self)

        # Ensure we have fresh connections before running async tasks
        for alias in connections:
            connections[alias].close()
            connections[alias].connect()

    def tearDown(self):
        # IMPORTANT: Django will close and terminate connections during test teardown,
        # but our Celery tasks in eager mode might still be using them.
        # We need to make sure all Celery tasks are done before closing connections.

        # Give pending tasks a chance to complete
        time.sleep(0.5)  # Add a small delay to ensure tasks have a chance to finish

        try:
            # Close connections before teardown to prevent them from being terminated
            # while still in use by async tasks
            for alias in connections:
                connections[alias].close_if_unusable_or_obsolete()
                connections[alias].close()
        except Exception as e:
            logging.warning(f"Error closing connections during tearDown: {e}")

        # Call both parent tearDown methods in reverse order
        CeleryEagerModeTestCase.tearDown(self)
        BaseFixtureTestCase.tearDown(self)
