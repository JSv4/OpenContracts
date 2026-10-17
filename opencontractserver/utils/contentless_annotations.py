"""Drop parser structural annotations that carry no content.

PDF text layers yield structural elements whose text is only whitespace (for
example NBSP runs) or symbol-font glyphs (bullets in the Unicode private-use
area). Such an annotation is not searchable, cannot be meaningfully embedded,
and clutters the annotation layer. The characters remain in the document's
text layer; only the overlay is dropped.

Only parser output is filtered (see ``BaseParser.save_parsed_data``). Imported
and user-created annotations are kept as given.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from opencontractserver.types.dicts import (
    OpenContractsAnnotationPythonType,
    OpenContractsRelationshipPythonType,
)
from opencontractserver.types.enums import ContentModality


def has_word_characters(text: str | None) -> bool:
    """True when ``text`` contains at least one letter or digit in any script."""
    return any(ch.isalnum() for ch in text or "")


def is_contentless_structural(annotation: OpenContractsAnnotationPythonType) -> bool:
    """A structural, text-only annotation with no letters or digits.

    Image annotations (figures) legitimately carry little or no text, so any
    annotation that references image content is kept.
    """
    modalities = annotation.get("content_modalities") or []
    return (
        bool(annotation.get("structural"))
        and ContentModality.IMAGE.value not in modalities
        and not has_word_characters(annotation.get("rawText"))
    )


def contentless_structural_filter(
    annotations: Iterable[OpenContractsAnnotationPythonType],
    relationships: Iterable[OpenContractsRelationshipPythonType],
) -> tuple[
    list[OpenContractsAnnotationPythonType],
    list[OpenContractsRelationshipPythonType],
    int,
]:
    """Remove contentless structural annotations from a parser export.

    Children of a dropped annotation are re-parented to its nearest kept
    ancestor so the hierarchy survives. Relationships lose dropped endpoints,
    and a relationship left without a source or a target is removed.

    Returns ``(annotations, relationships, dropped_count)``; inputs are not
    mutated. IDs are compared as strings because exports mix ``int`` and
    ``str`` IDs (see ``import_annotations``).
    """
    annotations = list(annotations)
    dropped = [a for a in annotations if is_contentless_structural(a)]
    if not dropped:
        return annotations, list(relationships), 0

    dropped_ids = {str(a["id"]) for a in dropped if a.get("id") is not None}
    parent_of = {
        str(a["id"]): a.get("parent_id") for a in annotations if a.get("id") is not None
    }

    def nearest_kept(parent_id: Any) -> Any:
        seen: set[str] = set()
        while parent_id is not None and str(parent_id) in dropped_ids:
            if str(parent_id) in seen:  # malformed cyclic export
                return None
            seen.add(str(parent_id))
            parent_id = parent_of.get(str(parent_id))
        return parent_id

    kept = []
    for annotation in annotations:
        if is_contentless_structural(annotation):
            continue
        parent_id = annotation.get("parent_id")
        if parent_id is not None and str(parent_id) in dropped_ids:
            annotation = annotation.copy()
            annotation["parent_id"] = nearest_kept(parent_id)
        kept.append(annotation)

    kept_relationships = []
    for relationship in relationships:
        sources = relationship.get("source_annotation_ids", [])
        targets = relationship.get("target_annotation_ids", [])
        kept_sources = [i for i in sources if str(i) not in dropped_ids]
        kept_targets = [i for i in targets if str(i) not in dropped_ids]
        if (sources and not kept_sources) or (targets and not kept_targets):
            continue
        if len(kept_sources) != len(sources) or len(kept_targets) != len(targets):
            relationship = relationship.copy()
            relationship["source_annotation_ids"] = kept_sources
            relationship["target_annotation_ids"] = kept_targets
        kept_relationships.append(relationship)

    return kept, kept_relationships, len(dropped)
