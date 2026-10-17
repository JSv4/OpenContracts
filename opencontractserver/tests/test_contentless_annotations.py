"""Contentless structural annotations: parse-time filter and cleanup command."""

from io import StringIO
from typing import cast

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Relationship,
)
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.warp_ingest_parser import WarpIngestParser
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.utils.contentless_annotations import (
    contentless_structural_filter,
    has_word_characters,
    is_contentless_structural,
)

User = get_user_model()

NBSP = " "
PUA_BULLET = ""


def _annot(id, text, parent_id=None, structural=True, modalities=("TEXT",)):
    return {
        "id": id,
        "annotationLabel": "Paragraph",
        "rawText": text,
        "page": 0,
        "annotation_json": {},
        "parent_id": parent_id,
        "annotation_type": "TOKEN_LABEL",
        "structural": structural,
        "content_modalities": list(modalities),
    }


def _rel(id, sources, targets):
    return {
        "id": id,
        "relationshipLabel": "refersTo",
        "source_annotation_ids": sources,
        "target_annotation_ids": targets,
        "structural": True,
    }


class ContentlessRuleTests(SimpleTestCase):
    def test_word_characters_in_any_script_count_as_content(self):
        for text in ("a", "7", "第", "Ж", "§ 1", " x "):
            self.assertTrue(has_word_characters(text), text)
        for blank in (None, "", NBSP * 3, PUA_BULLET, "•", " \t\n", "—", "..."):
            self.assertFalse(has_word_characters(blank), repr(blank))

    def test_only_structural_text_annotations_are_contentless(self):
        self.assertTrue(is_contentless_structural(_annot("a", NBSP)))
        self.assertFalse(is_contentless_structural(_annot("a", NBSP, structural=False)))
        self.assertFalse(
            is_contentless_structural(_annot("a", "", modalities=("TEXT", "IMAGE")))
        )
        self.assertFalse(is_contentless_structural(_annot("a", "Body")))


class ContentlessFilterTests(SimpleTestCase):
    def test_nothing_dropped_returns_input_unchanged(self):
        annotations = [_annot("a", "Title"), _annot("b", "Body", "a")]
        relationships = [_rel("r", ["a"], ["b"])]
        kept, kept_rels, dropped = contentless_structural_filter(
            annotations, relationships
        )
        self.assertEqual((kept, kept_rels, dropped), (annotations, relationships, 0))

    def test_children_are_reparented_past_chains_of_dropped_ancestors(self):
        annotations = [
            _annot("root", "Section 1"),
            _annot("bullet", PUA_BULLET, "root"),
            _annot("space", NBSP, "bullet"),
            _annot("leaf", "Item text", "space"),
        ]
        kept, _, dropped = contentless_structural_filter(annotations, [])
        self.assertEqual(dropped, 2)
        self.assertEqual([a["id"] for a in kept], ["root", "leaf"])
        self.assertEqual(kept[1]["parent_id"], "root")
        # Inputs are not mutated.
        self.assertEqual(annotations[3]["parent_id"], "space")

    def test_mixed_int_and_str_ids_match(self):
        annotations = [_annot(1, "Title"), _annot(2, NBSP, 1), _annot(3, "Body", "2")]
        kept, _, _ = contentless_structural_filter(annotations, [])
        self.assertEqual(kept[-1]["parent_id"], 1)

    def test_cyclic_parents_do_not_loop(self):
        annotations = [
            _annot("a", NBSP, "b"),
            _annot("b", NBSP, "a"),
            _annot("c", "x", "a"),
        ]
        kept, _, _ = contentless_structural_filter(annotations, [])
        self.assertEqual(kept, [{**annotations[2], "parent_id": None}])

    def test_relationships_lose_dropped_endpoints_and_empty_ones_go(self):
        annotations = [_annot("a", "A"), _annot("b", "B"), _annot("n", NBSP)]
        relationships = [
            _rel("trimmed", ["a"], ["b", "n"]),
            _rel("emptied", ["n"], ["a"]),
            _rel("untouched", ["a"], ["b"]),
        ]
        _, kept_rels, _ = contentless_structural_filter(annotations, relationships)
        self.assertEqual([r["id"] for r in kept_rels], ["trimmed", "untouched"])
        self.assertEqual(kept_rels[0]["target_annotation_ids"], ["b"])


class SaveParsedDataDropsContentlessTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="noise", password="pw12345678")
        self.doc = Document.objects.create(
            title="Noise Doc", file_type="pdf", creator=self.user
        )
        self.doc.pdf_file.save("n.pdf", ContentFile(b"%PDF-1.7\n%%EOF\n"))

    def test_contentless_structural_annotations_are_not_created(self):
        export = {
            "title": "Noise Doc",
            "content": "Title\nBody",
            "description": None,
            "pawls_file_content": [],
            "page_count": 1,
            "doc_labels": [],
            "labelled_text": [
                _annot("a1", "Title"),
                {**_annot("a2", PUA_BULLET, "a1"), "annotationLabel": "Bullet"},
                _annot("a3", "Body", "a2"),
            ],
            "relationships": [_rel("r1", ["a2"], ["a3"])],
        }
        WarpIngestParser().save_parsed_data(
            user_id=self.user.id,
            doc_id=self.doc.id,
            open_contracts_data=cast(OpenContractDocExport, export),
        )
        self.assertEqual(
            sorted(Annotation.objects.values_list("raw_text", flat=True)),
            ["Body", "Title"],
        )
        body = Annotation.objects.get(raw_text="Body")
        self.assertEqual(body.parent.raw_text, "Title")
        self.assertFalse(
            Relationship.objects.filter(relationship_label__text="refersTo").exists()
        )
        # No label is created only for dropped annotations.
        self.assertFalse(AnnotationLabel.objects.filter(text="Bullet").exists())


class PruneCommandTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="prune", password="pw12345678")
        self.doc = Document.objects.create(title="d", creator=self.user)
        self.label = AnnotationLabel.objects.create(
            text="Paragraph", label_type="TOKEN_LABEL", creator=self.user
        )
        self.rel_label = AnnotationLabel.objects.create(
            text="refersTo", label_type="RELATIONSHIP_LABEL", creator=self.user
        )

    def make(self, text, parent=None, structural=True, modalities=None):
        return Annotation.objects.create(
            document=self.doc,
            creator=self.user,
            annotation_label=self.label,
            raw_text=text,
            parent=parent,
            structural=structural,
            content_modalities=modalities or ["TEXT"],
        )

    def relate(self, sources, targets):
        rel = Relationship.objects.create(
            document=self.doc,
            creator=self.user,
            relationship_label=self.rel_label,
            structural=True,
        )
        rel.source_annotations.set(sources)
        rel.target_annotations.set(targets)
        return rel

    def run_command(self, *args):
        out = StringIO()
        call_command("prune_contentless_structural_annotations", *args, stdout=out)
        return out.getvalue()

    def test_prunes_noise_and_keeps_hierarchy_and_other_annotations(self):
        root = self.make("Section 1")
        bullet = self.make(PUA_BULLET, parent=root)
        space = self.make(NBSP * 2, parent=bullet)
        leaf = self.make("Item text", parent=space)
        cjk = self.make("第一条")
        figure = self.make("", modalities=["TEXT", "IMAGE"])
        user_made = self.make(NBSP, structural=False)
        emptied = self.relate([bullet], [leaf])
        trimmed = self.relate([root], [leaf, space])

        self.assertIn("would delete 2", self.run_command("--dry-run"))
        self.assertEqual(Annotation.objects.count(), 7)

        self.run_command()
        self.assertEqual(
            set(Annotation.objects.values_list("pk", flat=True)),
            {root.pk, leaf.pk, cjk.pk, figure.pk, user_made.pk},
        )
        leaf.refresh_from_db()
        self.assertEqual(leaf.parent_id, root.pk)
        self.assertFalse(Relationship.objects.filter(pk=emptied.pk).exists())
        self.assertEqual(list(trimmed.target_annotations.all()), [leaf])

        self.assertIn("No contentless", self.run_command())
