from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.test.utils import override_settings

from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import (
    Column,
    Datacell,
    Extract,
    Fieldset,
    LanguageModel,
)
from opencontractserver.tasks.extract_tasks import run_extract
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsTaskTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )

        self.language_model = LanguageModel.objects.create(
            model="TestModel", creator=self.user
        )
        self.fieldset = Fieldset.objects.create(
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            query="TestQuery",
            output_type="str",
            language_model=self.language_model,
            agentic=True,
            creator=self.user,
        )
        self.extract = Extract.objects.create(
            name="TestExtract",
            fieldset=self.fieldset,
            creator=self.user,
        )

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Doc",
            description="USC Title 1 - Chapter 1",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )

        self.extract.documents.add(self.doc)
        self.extract.save()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_run_extract_task(self):
        print(f"{self.extract.documents.all()}")

        # Run this SYNCHRONOUSLY for TESTIN' purposes
        run_extract.delay(self.extract.id, self.user.id)
        print(Datacell.objects.all().count())

        self.extract.refresh_from_db()
        self.assertIsNotNone(self.extract.started)

        row = Datacell.objects.filter(extract=self.extract, column=self.column).first()
        self.assertIsNotNone(row)
