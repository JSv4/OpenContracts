import json
from pathlib import Path
from typing import Any

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models.signals import post_save
from django.test.utils import (
    override_settings,
    setup_test_environment,
    teardown_test_environment,
)

from opencontractserver.annotations.models import Annotation
from opencontractserver.annotations.signals import process_annot_on_create_atomic
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import process_doc_on_create_atomic
from opencontractserver.tasks.doc_tasks import ingest_doc
from opencontractserver.tasks.embeddings_task import (
    calculate_embedding_for_annotation_text,
)
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


# Use this command to generate realistic text fixtures
class Command(BaseCommand):
    help = "Generate test fixtures by running document processing pipeline and dumping results"

    def setup_test_db(self) -> None:
        """Set up a test database."""
        setup_test_environment()
        # Create test DB - this is what TestCase does under the hood
        self.old_db_name = connection.settings_dict["NAME"]
        test_db_name = connection.creation.create_test_db(
            verbosity=1,
            autoclobber=True,
            serialize=False,
        )
        self.stdout.write(f"Created test database '{test_db_name}'")

    def teardown_test_db(self) -> None:
        """Destroy the test database."""
        connection.creation.destroy_test_db(self.old_db_name, verbosity=1)
        teardown_test_environment()
        self.stdout.write("Destroyed test database")

    def save_file_to_fixtures(self, file_obj, filename: str) -> str:
        """
        Save a file to the fixtures directory and return its relative path.

        Args:
            file_obj: The file field object
            filename: The desired filename in fixtures

        Returns:
            str: The new relative path for the fixture
        """
        fixtures_dir = Path("opencontractserver/tests/fixtures/files")
        fixtures_dir.mkdir(exist_ok=True)

        dest_path = fixtures_dir / filename

        # Read the file contents
        file_obj.seek(0)
        file_contents = file_obj.read()

        # Write to fixtures directory
        with open(dest_path, "wb") as f:
            f.write(file_contents)

        # Return a path relative to the fixtures directory - use files/ not fixtures/files/
        return f"files/{filename}"

    def process_fixtures(self, fixture_path: str) -> None:
        """
        Process the generated fixtures to update file paths and save files.

        Args:
            fixture_path: Path to the fixture file
        """
        with open(fixture_path) as f:
            data = json.load(f)

        for item in data:
            if item["model"] == "documents.document":
                fields = item["fields"]

                # For each file field, if it exists, copy the file and update the path
                file_fields = [
                    "pdf_file",
                    "txt_extract_file",
                    "pawls_parse_file",
                    "icon",
                ]
                for field in file_fields:
                    if fields.get(field):
                        # Get the actual file from the database
                        doc = Document.objects.get(pk=item["pk"])
                        file_obj = getattr(doc, field)
                        if file_obj:
                            # Generate a unique filename
                            filename = (
                                f"doc_{item['pk']}_{field}{Path(file_obj.name).suffix}"
                            )
                            # Save the file and update the path
                            new_path = self.save_file_to_fixtures(
                                file_obj.file, filename
                            )
                            fields[field] = new_path

        # Write the updated fixture data back
        with open(fixture_path, "w") as f:
            json.dump(data, f, indent=2)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def handle(self, *args: Any, **options: Any) -> None:
        try:
            # Set up test database
            self.setup_test_db()

            # Disconnect signals just like in the test
            post_save.disconnect(process_annot_on_create_atomic, sender=Annotation)
            post_save.disconnect(process_doc_on_create_atomic, sender=Document)

            # Create test user
            user = User.objects.create_user(username="testuser", password="testpass")

            # Create and process documents exactly as in the test
            pdf_file = ContentFile(
                SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
            )

            doc = Document.objects.create(
                creator=user,
                title="Test Doc",
                description="USC Title 1 - Chapter 1",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

            pdf_file = ContentFile(
                SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
            )

            # Create and process three docs as in the test
            doc = Document.objects.create(
                creator=user,
                title="Rando Doc",
                description="RANDO DOC!",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

            # Run ingest pipeline synchronously
            self.stdout.write("Processing first document...")
            ingest_doc.delay(user_id=user.id, doc_id=doc.id)

            # Calculate embeddings for annotations
            for annot in Annotation.objects.all():
                calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

            doc2 = Document.objects.create(
                creator=user,
                title="Rando Doc 2",
                description="RANDO DOC! 2",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

            self.stdout.write("Processing second document...")
            ingest_doc.delay(user_id=user.id, doc_id=doc2.id)

            for annot in Annotation.objects.filter(document_id=doc2.id):
                calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

            doc3 = Document.objects.create(
                creator=user,
                title="Rando Doc 3",
                description="RANDO DOC! 3",
                custom_meta={},
                pdf_file=pdf_file,
                backend_lock=True,
            )

            self.stdout.write("Processing third document...")
            ingest_doc.delay(user_id=user.id, doc_id=doc3.id)

            for annot in Annotation.objects.filter(document_id=doc3.id):
                calculate_embedding_for_annotation_text.delay(annotation_id=annot.id)

            # Dump ALL data to fixtures
            self.stdout.write("Dumping test data to fixture files...")

            fixture_path = "opencontractserver/tests/fixtures/test_data.json"

            # First dump the main data
            apps_to_dump = [
                "users.user",
                "documents.document",
                "annotations.annotationlabel",
                "annotations.annotation",
            ]

            call_command("dumpdata", *apps_to_dump, indent=2, output=fixture_path)

            # Process the fixtures to handle file fields
            self.process_fixtures(fixture_path)

            self.stdout.write(
                self.style.SUCCESS(
                    "Successfully generated test fixtures in opencontractserver/tests/fixtures/"
                )
            )

        finally:
            # Always clean up the test database
            self.teardown_test_db()
