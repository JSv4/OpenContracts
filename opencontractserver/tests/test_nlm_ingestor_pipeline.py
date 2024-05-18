# Copyright (C) 2024  John Scrudato
import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.documents.models import Document
from opencontractserver.tasks.doc_tasks import (
    extract_thumbnail,
    nlm_ingest_pdf
)
from opencontractserver.tests.fixtures import NLM_INGESTOR_SAMPLE_PDF, NLM_INGESTOR_EXPECTED_JSON

User = get_user_model()

logger = logging.getLogger(__name__)


class NlmIngestorTestCase(TestCase):

