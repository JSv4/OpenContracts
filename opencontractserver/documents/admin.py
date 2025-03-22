from django.contrib import admin
from django.db.models import Count
from guardian.admin import GuardedModelAdmin

from opencontractserver.annotations.models import Embedding
from opencontractserver.documents.models import (
    Document,
    DocumentAnalysisRow,
    DocumentRelationship,
)


class DocumentEmbeddingInline(admin.TabularInline):
    """
    Inline admin for displaying embeddings associated with a document.
    """

    model = Embedding
    fk_name = "document"
    fields = ("id", "embedder_path", "dimension", "created", "modified")
    readonly_fields = ("id", "embedder_path", "dimension", "created", "modified")
    extra = 0

    def dimension(self, obj):
        """Display which vector dimension is populated."""
        if obj.vector_384 is not None:
            return "384"
        elif obj.vector_768 is not None:
            return "768"
        elif obj.vector_1536 is not None:
            return "1536"
        elif obj.vector_3072 is not None:
            return "3072"
        return "Unknown"

    dimension.short_description = "Dimension"


@admin.register(Document)
class DocumentAdmin(GuardedModelAdmin):
    list_display_links = ["id", "title"]
    list_select_related = ("creator",)
    list_display = [
        "id",
        "title",
        "description",
        "backend_lock",
        "user_lock",
        "total_embeddings",
    ]
    search_fields = ["id", "title", "description", "creator__username"]
    list_filter = ("is_public", "created", "modified", "page_count")
    raw_id_fields = ("creator",)
    date_hierarchy = "created"
    inlines = [DocumentEmbeddingInline]

    def get_queryset(self, request):
        """
        Override queryset to annotate with embedding count.
        """
        qs = super().get_queryset(request)
        return qs.annotate(total_embeddings=Count("embedding_set", distinct=True))

    def total_embeddings(self, obj):
        """
        Display the total number of embeddings for this document.
        """
        return obj.total_embeddings

    total_embeddings.admin_order_field = "total_embeddings"
    total_embeddings.short_description = "Embeddings"


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
