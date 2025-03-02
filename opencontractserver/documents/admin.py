from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.documents.models import (
    Document,
    DocumentAnalysisRow,
    DocumentRelationship,
)


@admin.register(Document)
class DocumentAdmin(GuardedModelAdmin):
    list_display_links = ["id", "title"]
    list_select_related = ("creator",)
    list_display = ["id", "title", "description", "backend_lock", "user_lock"]
    search_fields = ["id", "title", "description", "creator__username"]
    list_filter = ("is_public", "created", "modified", "page_count")
    raw_id_fields = ("creator",)
    date_hierarchy = "created"


@admin.register(DocumentAnalysisRow)
class DocumentAnalysisRowAdmin(GuardedModelAdmin):
    list_display = ["id", "document", "analysis", "extract", "creator"]


@admin.register(DocumentRelationship)
class DocumentRelationshipAdmin(GuardedModelAdmin):
    """Admin interface for DocumentRelationship model"""

    list_display = [
        "id",
        "source_document",
        "target_document",
        "relationship_type",
        "annotation_label",
    ]
    search_fields = ["id", "source_document__title", "target_document__title"]
    list_filter = ("relationship_type", "created", "modified")
    raw_id_fields = (
        "source_document",
        "target_document",
        "annotation_label",
        "corpus",
        "creator",
    )
