"""Delete structural annotations that carry no letters or digits.

Parsers no longer create these (``utils/contentless_annotations.py``); this
removes the ones stored before that filter existed. The rule is the parser's:
structural, no image content, and no letter or digit in any script.

Children are re-parented to the nearest kept ancestor first, because
``Annotation.parent`` cascades. Relationships left without a source or a
target are deleted. Idempotent.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q

from opencontractserver.annotations.models import Annotation, Relationship
from opencontractserver.types.enums import ContentModality
from opencontractserver.utils.contentless_annotations import has_word_characters


class Command(BaseCommand):
    help = (
        "Delete structural annotations whose text has no letters or digits "
        "(whitespace or symbol glyphs only), keeping their children."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be deleted but don't delete anything.",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]

        # ASCII prefilter is locale-independent and keeps the scan small; the
        # Unicode-aware check below decides (it keeps non-Latin scripts).
        candidates = (
            Annotation.objects.filter(structural=True)
            .exclude(content_modalities__contains=[ContentModality.IMAGE.value])
            .exclude(raw_text__regex=r"[A-Za-z0-9]")
            .values_list("pk", "parent_id", "raw_text")
        )
        parent_of = {
            pk: parent_id
            for pk, parent_id, raw_text in candidates.iterator()
            if not has_word_characters(raw_text)
        }
        if not parent_of:
            self.stdout.write(
                self.style.SUCCESS("No contentless structural annotations.")
            )
            return

        dropped = set(parent_of)
        children = Annotation.objects.filter(parent_id__in=dropped).exclude(
            pk__in=dropped
        )
        relationships = Relationship.objects.filter(
            Q(source_annotations__in=dropped) | Q(target_annotations__in=dropped)
        ).distinct()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] would delete {len(dropped)} contentless structural "
                    f"annotations, re-parent {children.count()} children and "
                    f"update {relationships.count()} relationships"
                )
            )
            return

        def nearest_kept(parent_id):
            seen = set()
            while parent_id in dropped and parent_id not in seen:
                seen.add(parent_id)
                parent_id = parent_of[parent_id]
            return None if parent_id in dropped else parent_id

        with transaction.atomic():
            reparented = 0
            for child in children.only("pk", "parent_id"):
                child.parent_id = nearest_kept(child.parent_id)
                child.save(update_fields=["parent_id"])
                reparented += 1
            relationship_ids = list(relationships.values_list("pk", flat=True))
            deleted, _ = Annotation.objects.filter(pk__in=dropped).delete()
            emptied, _ = (
                Relationship.objects.filter(pk__in=relationship_ids)
                .annotate(
                    n_sources=Count("source_annotations", distinct=True),
                    n_targets=Count("target_annotations", distinct=True),
                )
                .filter(Q(n_sources=0) | Q(n_targets=0))
                .delete()
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {len(dropped)} contentless structural annotations "
                f"({deleted} rows incl. embeddings), re-parented {reparented} "
                f"children, removed {emptied} emptied relationship rows"
            )
        )
