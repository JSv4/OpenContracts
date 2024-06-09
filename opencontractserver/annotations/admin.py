from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)


@admin.register(Annotation)
class AnnotationAdmin(GuardedModelAdmin):
    list_display = ["id", "page", "raw_text", "annotation_label"]
    list_filter = ("analysis",)
    search_fields = ("id", "raw_text")


@admin.register(Relationship)
class RelationshipAdmin(GuardedModelAdmin):
    list_display = ["id", "relationship_label"]


@admin.register(AnnotationLabel)
class AnnotationLabelAdmin(GuardedModelAdmin):
    list_display = ["id", "color", "icon", "text"]


@admin.register(LabelSet)
class LabelSetAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description"]
