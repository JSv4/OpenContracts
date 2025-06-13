from __future__ import annotations

import json
import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, TransactionTestCase

from opencontractserver.annotations.models import SPAN_LABEL, TOKEN_LABEL, Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools.core_tools import (
    aadd_annotations_from_exact_strings,
    add_annotations_from_exact_strings,
)
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_TXT_FILE_ONE_PATH,
)

User = get_user_model()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Utility helpers for tests
# ---------------------------------------------------------------------------


def _build_pawls_tokens_for_text(text: str):
    """Generate a minimal PAWLS token layer for *text* on a single page."""

    tokens = []
    cursor_x = 0.0
    for token_text in text.split():
        tokens.append(
            {
                "x": cursor_x,
                "y": 0.0,
                "width": float(len(token_text)),
                "height": 10.0,
                "text": token_text,
            }
        )
        cursor_x += len(token_text) + 1  # simple separation

    page_obj = {
        "page": {"width": 612.0, "height": 792.0, "index": 0},
        "tokens": tokens,
    }
    return [page_obj]


# ---------------------------------------------------------------------------
# Sync tests
# ---------------------------------------------------------------------------


class TestLLMAnnotationTools(TestCase):
    def setUp(self):  # noqa: D401
        """Create base user and corpus."""

        self.user = User.objects.create_user("anno_user", password="pass")
        self.corpus = Corpus.objects.create(title="Anno Corpus", creator=self.user)

    # ---------------------------- PDF ----------------------------------- #

    def _create_pdf_document(self) -> Document:
        pawls_json = SAMPLE_PAWLS_FILE_ONE_PATH.read_text()
        pawls_tokens = json.loads(pawls_json)

        doc = Document.objects.create(
            creator=self.user,
            title="PDF Doc",
            file_type="application/pdf",
            page_count=len(pawls_tokens),
        )
        doc.pawls_parse_file.save(
            SAMPLE_PAWLS_FILE_ONE_PATH.name, ContentFile(pawls_json.encode())
        )
        doc.save()
        self.corpus.documents.add(doc)
        return doc

    def test_add_annotations_pdf(self):
        """Exact-string PDF annotation results in TOKEN_LABEL annotations."""

        doc = self._create_pdf_document()

        search_word = "Agreement"  # Appears multiple times in sample contract
        tuples: list[tuple[str, str, int, int]] = [
            (
                "ContractTerm",
                search_word,
                doc.id,
                self.corpus.id,
            )
        ]

        new_ids = add_annotations_from_exact_strings(tuples, creator_id=self.user.id)

        self.assertGreaterEqual(len(new_ids), 1)

        # Validate label / labelset setup
        self.corpus.refresh_from_db()
        self.assertIsNotNone(self.corpus.label_set)
        label = self.corpus.label_set.annotation_labels.get(text="ContractTerm")
        self.assertEqual(label.label_type, TOKEN_LABEL)

        for ann in Annotation.objects.filter(id__in=new_ids):
            self.assertEqual(ann.annotation_label_id, label.id)
            self.assertEqual(ann.annotation_type, TOKEN_LABEL)
            self.assertEqual(ann.document_id, doc.id)
            self.assertIn(search_word, ann.raw_text)

    # ---------------------------- TEXT ---------------------------------- #

    def _create_text_document(self) -> Document:
        text_content = SAMPLE_TXT_FILE_ONE_PATH.read_text()
        doc = Document.objects.create(
            creator=self.user,
            title="Text Doc",
            file_type="text/plain",
        )
        doc.txt_extract_file.save(
            SAMPLE_TXT_FILE_ONE_PATH.name, ContentFile(text_content.encode())
        )
        doc.save()
        self.corpus.documents.add(doc)
        return doc

    def test_add_annotations_text(self):
        """Exact-string TEXT annotation results in SPAN_LABEL annotations."""

        doc = self._create_text_document()

        tuples = [("LegalTerm", "Agreement", doc.id, self.corpus.id)]
        new_ids = add_annotations_from_exact_strings(tuples, creator_id=self.user.id)

        self.assertGreaterEqual(len(new_ids), 1)

        self.corpus.refresh_from_db()
        label = self.corpus.label_set.annotation_labels.get(text="LegalTerm")
        self.assertEqual(label.label_type, SPAN_LABEL)

        for ann in Annotation.objects.filter(id__in=new_ids):
            self.assertEqual(ann.annotation_label_id, label.id)
            self.assertEqual(ann.annotation_type, SPAN_LABEL)
            self.assertEqual(ann.document_id, doc.id)
            self.assertIn("Agreement", ann.raw_text)


# ---------------------------------------------------------------------------
# Async tests
# ---------------------------------------------------------------------------


class AsyncTestLLMAnnotationTools(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = User.objects.create_user("async_user", password="pass")
        cls.corpus = Corpus.objects.create(title="Async Corpus", creator=cls.user)

        # Prepare PDF doc
        cls.pdf_doc = Document.objects.create(
            creator=cls.user,
            title="Async PDF",
            file_type="application/pdf",
        )
        pawls_json = SAMPLE_PAWLS_FILE_ONE_PATH.read_text()
        cls.pdf_doc.pawls_parse_file.save(
            SAMPLE_PAWLS_FILE_ONE_PATH.name, ContentFile(pawls_json.encode())
        )
        cls.corpus.documents.add(cls.pdf_doc)

        # Prepare text doc
        cls.txt_doc = Document.objects.create(
            creator=cls.user,
            title="Async TXT",
            file_type="text/plain",
        )
        cls.txt_doc.txt_extract_file.save(
            SAMPLE_TXT_FILE_ONE_PATH.name,
            ContentFile(SAMPLE_TXT_FILE_ONE_PATH.read_bytes()),
        )
        cls.corpus.documents.add(cls.txt_doc)

    # -------------------- async tests ---------------------------- #

    async def test_async_pdf_and_text(self):
        tuples = [
            ("ContractTerm", "Agreement", self.pdf_doc.id, self.corpus.id),
            ("TextTerm", "Agreement", self.txt_doc.id, self.corpus.id),
        ]

        new_ids = await aadd_annotations_from_exact_strings(
            tuples, creator_id=self.user.id
        )

        # Expect 2 (Agreement appears twice, Company twice) = 4 annotations
        self.assertGreaterEqual(len(new_ids), 2)
        self.assertEqual(
            await Annotation.objects.filter(pk__in=new_ids).acount(), len(new_ids)
        )

        # Validate correct label types
        corpus_refresh = await Corpus.objects.select_related("label_set").aget(
            pk=self.corpus.id
        )
        agreement_label = await corpus_refresh.label_set.annotation_labels.aget(
            text="ContractTerm"
        )
        company_label = await corpus_refresh.label_set.annotation_labels.aget(
            text="TextTerm"
        )
        self.assertEqual(agreement_label.label_type, TOKEN_LABEL)
        self.assertEqual(company_label.label_type, SPAN_LABEL)

        pdf_count = await Annotation.objects.filter(
            annotation_label=agreement_label
        ).acount()
        text_count = await Annotation.objects.filter(
            annotation_label=company_label
        ).acount()
        self.assertGreaterEqual(pdf_count, 1)
        self.assertGreaterEqual(text_count, 1)
