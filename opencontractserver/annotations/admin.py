from django.contrib import admin
from django.db.models import Count
from guardian.admin import GuardedModelAdmin

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Embedding,
    LabelSet,
    Note,
    Relationship,
)


class AnnotationEmbeddingInline(admin.TabularInline):
    """
    Inline admin for displaying embeddings associated with an annotation.
    """

    model = Embedding
    fk_name = "annotation"
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


class NoteEmbeddingInline(admin.TabularInline):
    """
    Inline admin for displaying embeddings associated with a note.
    """

    model = Embedding
    fk_name = "note"
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


@admin.register(Annotation)
class AnnotationAdmin(GuardedModelAdmin):
    list_display = ["id", "page", "raw_text", "annotation_label", "total_embeddings"]
    search_fields = ["id", "raw_text", "annotation_label__text", "document__title"]
    list_filter = ("analysis", "page", "structural", "created", "modified", "is_public")
    raw_id_fields = ("annotation_label", "document", "corpus", "analysis", "creator")
    inlines = [AnnotationEmbeddingInline]

    def get_queryset(self, request):
        """
        Override queryset to annotate with embedding count.
        """
        qs = super().get_queryset(request)
        return qs.annotate(total_embeddings=Count("embedding_set", distinct=True))

    def total_embeddings(self, obj):
        """
        Display the total number of embeddings for this annotation.
        """
        return obj.total_embeddings

    total_embeddings.admin_order_field = "total_embeddings"
    total_embeddings.short_description = "Embeddings"


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

    list_display = [
        "id",
        "title",
        "document",
        "creator",
        "created",
        "modified",
        "total_embeddings",
    ]
    search_fields = ["id", "title", "content", "document__title", "creator__username"]
    list_filter = ("is_public", "created", "modified")
    raw_id_fields = ("parent", "document", "annotation", "creator")
    inlines = [NoteEmbeddingInline]

    def get_queryset(self, request):
        """
        Override queryset to annotate with embedding count.
        """
        qs = super().get_queryset(request)
        return qs.annotate(total_embeddings=Count("embedding_set", distinct=True))

    def total_embeddings(self, obj):
        """
        Display the total number of embeddings for this note.
        """
        return obj.total_embeddings

    total_embeddings.admin_order_field = "total_embeddings"
    total_embeddings.short_description = "Embeddings"


@admin.register(Embedding)
class EmbeddingAdmin(GuardedModelAdmin):
    """Admin interface for Embedding model"""

    list_display = [
        "id",
        "embedder_path",
        "dimension_info",
        "reference_type",
        "created",
        "modified",
    ]
    list_filter = ("created", "modified", "embedder_path")
    search_fields = ["embedder_path", "id"]
    raw_id_fields = ("document", "annotation", "note", "creator")

    def reference_type(self, obj):
        """Display what type of object this embedding belongs to."""
        if obj.document_id:
            return f"Document #{obj.document_id}"
        elif obj.annotation_id:
            return f"Annotation #{obj.annotation_id}"
        elif obj.note_id:
            return f"Note #{obj.note_id}"
        return "Unknown"

    reference_type.short_description = "Referenced Object"

    def dimension_info(self, obj):
        """Display which vector dimension is populated."""
        dimensions = []
        if obj.vector_384 is not None:
            dimensions.append("384")
        if obj.vector_768 is not None:
            dimensions.append("768")
        if obj.vector_1536 is not None:
            dimensions.append("1536")
        if obj.vector_3072 is not None:
            dimensions.append("3072")
        return ", ".join(dimensions) if dimensions else "None"

    dimension_info.short_description = "Dimensions"
