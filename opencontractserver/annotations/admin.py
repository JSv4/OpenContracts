from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Note,
    Relationship,
)


@admin.register(Annotation)
class AnnotationAdmin(GuardedModelAdmin):
    list_display = ["id", "page", "raw_text", "annotation_label"]
    search_fields = ["id", "raw_text", "annotation_label__text", "document__title"]
    list_filter = ("analysis", "page", "structural", "created", "modified", "is_public")
    raw_id_fields = ("annotation_label", "document", "corpus", "analysis", "creator")


@admin.register(Relationship)
class RelationshipAdmin(GuardedModelAdmin):
    list_display = ["id", "relationship_label"]
    raw_id_fields = (
        "relationship_label",
        "corpus",
        "document",
        "source_annotations",
        "target_annotations",
        "analyzer",
        "creator",
    )


@admin.register(AnnotationLabel)
class AnnotationLabelAdmin(GuardedModelAdmin):
    list_display = ["id", "color", "icon", "text"]


@admin.register(LabelSet)
class LabelSetAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description"]


@admin.register(Note)
class NoteAdmin(GuardedModelAdmin):
    """Admin interface for Note model"""

    list_display = ["id", "title", "document", "creator", "created", "modified"]
    search_fields = ["id", "title", "content", "document__title", "creator__username"]
    list_filter = ("is_public", "created", "modified")
    raw_id_fields = ("parent", "document", "annotation", "creator")
