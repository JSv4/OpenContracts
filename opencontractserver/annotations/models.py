import uuid
from typing import Optional

import django
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

# Switching from Django-tree-queries to django-cte as it
# appears that django-tree-query has performance issues for large tables.
# See https://github.com/feincms/django-tree-queries/issues/77
# This will become an issue for annotations in particular. Since annotations will
# have a simple structure and query anyway, using django-cte here. Can migrate models
# using django-tree-queries down the road but shouldn't affect each other on
# separate models.
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase
from pgvector.django import VectorField

from opencontractserver.shared.defaults import (
    empty_bounding_box,
    jsonfield_default_value,
    jsonfield_empty_array,
)
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel
from opencontractserver.shared.mixins import HasEmbeddingMixin
from opencontractserver.shared.utils import calc_oc_file_path

# Import your new managers
from opencontractserver.shared.Managers import AnnotationManager, EmbeddingManager, NoteManager

User = get_user_model()

# TODO - can we use the Python enum in data_types.py to drive choices
RELATIONSHIP_LABEL = "RELATIONSHIP_LABEL"
DOC_TYPE_LABEL = "DOC_TYPE_LABEL"
TOKEN_LABEL = "TOKEN_LABEL"
METADATA_LABEL = "METADATA_LABEL"
SPAN_LABEL = "SPAN_LABEL"

LABEL_TYPES = [
    (RELATIONSHIP_LABEL, _("Relationship label.")),
    (DOC_TYPE_LABEL, _("Document-level type label.")),
    (TOKEN_LABEL, _("Token-level labels for token-based labeling")),
    (SPAN_LABEL, _("Span labels for span-based labeling")),
    (METADATA_LABEL, _("Metadata label for manual entry field")),
]

# Define embedding dimensions constants
EMBEDDING_DIM_384 = 384
EMBEDDING_DIM_768 = 768
EMBEDDING_DIM_1536 = 1536
EMBEDDING_DIM_3072 = 3072

EMBEDDING_DIMENSIONS = [
    (EMBEDDING_DIM_384, "384"),
    (EMBEDDING_DIM_768, "768"),
    (EMBEDDING_DIM_1536, "1536"),
    (EMBEDDING_DIM_3072, "3072"),
]

class AnnotationLabel(BaseOCModel):

    label_type = django.db.models.CharField(
        max_length=128,
        blank=False,
        null=False,
        choices=LABEL_TYPES,
        default=TOKEN_LABEL,
    )

    # If an analyzer requires a specific label, we want to track this so we can ensure we don't install copies of it
    # over and over again.
    analyzer = django.db.models.ForeignKey(
        "analyzer.Analyzer",
        null=True,
        blank=True,
        related_name="annotation_labels",
        on_delete=django.db.models.SET_NULL,
    )

    # If this is meant to be a 'built-in' label and be used across corpuses without being explicitly added to a
    # labelset, set this value to True
    read_only = django.db.models.BooleanField(default=False)

    color = django.db.models.CharField(
        max_length=12, blank=False, null=False, default="#05313d"
    )
    description = django.db.models.TextField(null=False, default="")
    icon = django.db.models.CharField(
        max_length=128, blank=False, null=False, default="tags"
    )
    text = django.db.models.CharField(
        max_length=128, blank=False, null=False, default="Text Label"
    )

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=False,
        default=1,
    )

    class Meta:
        permissions = (
            ("permission_annotationlabel", "permission Annotationlabel"),
            ("publish_annotationlabel", "publish Annotationlabel"),
            ("create_annotationlabel", "create Annotationlabel"),
            ("read_annotationlabel", "read Annotationlabel"),
            ("update_annotationlabel", "update Annotationlabel"),
            ("remove_annotationlabel", "delete Annotationlabel"),
        )

        indexes = [
            django.db.models.Index(fields=["label_type"]),
            django.db.models.Index(fields=["analyzer"]),
            django.db.models.Index(fields=["text"]),
            django.db.models.Index(fields=["creator"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
        ]

        constraints = [
            django.db.models.UniqueConstraint(
                fields=["analyzer", "text", "creator", "label_type"],
                name="Only install one label of given name for each analyzer_id PER user (no duplicates)",
            )
        ]

    # Override save to update modified on save
    def save(self, *args, **kwargs):
        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()

        return super().save(*args, **kwargs)


# Model for Django Guardian permissions... trying to improve performance...
class AnnotationLabelUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "AnnotationLabel", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions... trying to improve performance...
class AnnotationLabelGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "AnnotationLabel", on_delete=django.db.models.CASCADE
    )
    # enabled = False


class Relationship(BaseOCModel):
    relationship_label = django.db.models.ForeignKey(
        "AnnotationLabel",
        null=True,
        on_delete=django.db.models.CASCADE,
        related_name="relationships",
    )
    corpus = django.db.models.ForeignKey(
        "corpuses.Corpus",
        null=True,
        on_delete=django.db.models.CASCADE,
        related_name="relationships",
    )
    document = django.db.models.ForeignKey(
        "documents.Document",
        related_name="relationships",
        null=False,
        on_delete=django.db.models.CASCADE,
    )
    source_annotations = django.db.models.ManyToManyField(
        "annotations.Annotation",
        related_name="source_node_in_relationships",
        related_query_name="source_node_in_relationship",
        blank=True,
    )
    target_annotations = django.db.models.ManyToManyField(
        "annotations.Annotation",
        related_name="target_node_in_relationships",
        related_query_name="target_node_in_relationship",
        blank=True,
    )

    # If relationshi was created by an analyzer as part of an analysis, we want to track
    # this.
    analyzer = django.db.models.ForeignKey(
        "analyzer.Analyzer", on_delete=django.db.models.SET_NULL, null=True, blank=True
    )

    # If this annotation was created as part of an analysis... track that.
    # TODO - ensure we actually import relationships (and this attribute) from analyzers
    analysis = django.db.models.ForeignKey(
        "analyzer.Analysis",
        null=True,
        blank=True,
        on_delete=django.db.models.CASCADE,
        related_name="relationships",
    )

    # Some relationships are structural and not corpus-specific
    structural = django.db.models.BooleanField(default=False)

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=False,
        default=1,
    )

    # Timing variables
    created = django.db.models.DateTimeField(
        "Creation Date and Time", default=timezone.now
    )
    modified = django.db.models.DateTimeField(default=timezone.now, blank=True)

    class Meta:
        permissions = (
            ("permission_relationship", "permission relationship"),
            ("create_relationship", "create relationship"),
            ("read_relationship", "read relationship"),
            ("update_relationship", "update relationship"),
            ("remove_relationship", "delete relationship"),
            ("publish_relationship", "publish relationship"),
        )

        indexes = [
            django.db.models.Index(fields=["relationship_label"]),
            django.db.models.Index(fields=["corpus"]),
            django.db.models.Index(fields=["document"]),
            django.db.models.Index(fields=["analyzer"]),
            django.db.models.Index(fields=["creator"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
        ]

    # Override save to update modified on save
    def save(self, *args, **kwargs):
        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()

        return super().save(*args, **kwargs)


# Model for Django Guardian permissions... trying to improve performance...
class RelationshipUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Relationship", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions... trying to improve performance...
class RelationshipGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Relationship", on_delete=django.db.models.CASCADE
    )
    # enabled = False


class Embedding(BaseOCModel):
    """
    The Embedding model stores a single vector embedding (or multiple dimension-specific
    embeddings) that references exactly one parent object, such as a Document, Annotation, or Note.

    By having foreign keys to each model, you can store embeddings in a single table
    and link them back to whichever model they belong to.

    Attributes:
        document (Optional[Document]): A reference to an associated Document, if applicable.
        annotation (Optional[Annotation]): A reference to an associated Annotation, if applicable.
        note (Optional[Note]): A reference to an associated Note, if applicable.
        embedder_path (str): A field storing the embedder or model path used to generate this embedding.
        vector_384 (VectorField): A 384-dimensional embedding vector, if used.
        vector_768 (VectorField): A 768-dimensional embedding vector, if used.
        vector_1536 (VectorField): A 1536-dimensional embedding vector, if used.
        vector_3072 (VectorField): A 3072-dimensional embedding vector, if used.
        created (datetime): Timestamp when this embedding record was created.
        modified (datetime): Timestamp when this embedding record was last updated.
    """

    objects = EmbeddingManager()

    # One of these will be non-null if the embedding belongs to that model.
    document = django.db.models.ForeignKey(
        "documents.Document",
        related_name="embedding_set",
        on_delete=django.db.models.CASCADE,
        null=True,
        blank=True,
        help_text="References the Document that this embedding belongs to (if any).",
    )
    annotation = django.db.models.ForeignKey(
        "annotations.Annotation",
        related_name="embedding_set",
        on_delete=django.db.models.CASCADE,
        null=True,
        blank=True,
        help_text="References the Annotation that this embedding belongs to (if any).",
    )
    note = django.db.models.ForeignKey(
        "annotations.Note",
        related_name="embedding_set",
        on_delete=django.db.models.CASCADE,
        null=True,
        blank=True,
        help_text="References the Note that this embedding belongs to (if any).",
    )

    # The name/path of the model used to generate this embedding
    embedder_path: str = django.db.models.CharField(
        max_length=256,
        null=True,
        blank=True,
        help_text="Identifier for the embedding model or pipeline used (e.g. 'openai/text-embedding-ada-002').",
    )

    # Multiple dimension-specific embeddings
    vector_384 = VectorField(dimensions=EMBEDDING_DIM_384, null=True, blank=True)
    vector_768 = VectorField(dimensions=EMBEDDING_DIM_768, null=True, blank=True)
    vector_1536 = VectorField(dimensions=EMBEDDING_DIM_1536, null=True, blank=True)
    vector_3072 = VectorField(dimensions=EMBEDDING_DIM_3072, null=True, blank=True)

    # Metadata
    created = django.db.models.DateTimeField(default=timezone.now, blank=True)
    modified = django.db.models.DateTimeField(default=timezone.now, blank=True)

    def save(self, *args, **kwargs) -> None:
        """
        Overridden save method:
          - ensures modified timestamp is updated
          - optionally you can validate that exactly one of (document, annotation, note) is set
        """
        self.modified = timezone.now()
        super().save(*args, **kwargs)

    def clean(self) -> None:
        """
        Optionally enforce that exactly one of document, annotation, or note is non-null,
        if that is a business rule for your app.
        """
        super().clean()

        parent_references = sum(
            [
                bool(self.document),
                bool(self.annotation),
                bool(self.note),
            ]
        )
        if parent_references == 0:
            raise ValueError(
                "Embedding must reference at least one of Document, Annotation, or Note."
            )
        # If you want to enforce "exactly one," just check parent_references != 1

    class Meta:
        indexes = [
            django.db.models.Index(fields=["embedder_path"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
        ]
        verbose_name = "Embedding"
        verbose_name_plural = "Embeddings"

    def __str__(self):
        return f"Embedding (ID={self.pk}) [{self.embedder_path or 'Unknown Model'}]"


class Annotation(BaseOCModel, HasEmbeddingMixin):
    """
    The Annotation model represents annotations within documents.
    """

    # Use the custom manager that combines permissioning and CTE capabilities
    objects = AnnotationManager()

    page = django.db.models.IntegerField(default=1, blank=False)
    raw_text = django.db.models.TextField(null=True, blank=True)
    tokens_jsons = NullableJSONField(
        default=jsonfield_empty_array, null=True, blank=True
    )
    bounding_box = NullableJSONField(default=empty_bounding_box, null=True)
    json = NullableJSONField(default=jsonfield_default_value, null=False)

    # New parent field for hierarchical relationships
    parent = django.db.models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=django.db.models.CASCADE,
    )

    # This is kind of duplicative of the AnnotationLabel label_type, BUT,
    # it makes more sense here. Slowly going to transition to this
    annotation_type = django.db.models.CharField(
        max_length=128,
        blank=False,
        null=False,
        choices=LABEL_TYPES,
        default=TOKEN_LABEL,
    )

    annotation_label = django.db.models.ForeignKey(
        "annotations.AnnotationLabel", null=True, on_delete=django.db.models.CASCADE
    )
    document = django.db.models.ForeignKey(
        "documents.Document",
        null=False,
        on_delete=django.db.models.CASCADE,
        related_name="doc_annotations",
        related_query_name="doc_annotation",
    )
    corpus = django.db.models.ForeignKey(
        "corpuses.Corpus",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="annotations",
    )

    # Vector for vector search - legacy field, will be deprecated
    embedding = VectorField(dimensions=384, null=True)
    
    # New relationship to the Embedding model
    embeddings = django.db.models.ForeignKey(
        "annotations.Embedding",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="annotations",
    )

    # If this annotation was created as part of an analysis... track that.
    analysis = django.db.models.ForeignKey(
        "analyzer.Analysis",
        null=True,
        blank=True,
        on_delete=django.db.models.CASCADE,
        related_name="annotations",
    )

    # Mark structural / layout annotations explicitly.
    structural = django.db.models.BooleanField(default=False)

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=False,
        default=1,
    )

    # Timing variables
    created = django.db.models.DateTimeField(
        "Creation Date and Time", default=timezone.now
    )
    modified = django.db.models.DateTimeField(default=timezone.now, blank=True)

    def get_embedding_reference_kwargs(self) -> dict:
        return {"annotation_id": self.pk}

    class Meta:
        permissions = (
            ("permission_annotation", "permission annotation"),
            ("create_annotation", "create annotation"),
            ("read_annotation", "read annotation"),
            ("update_annotation", "update annotation"),
            ("remove_annotation", "delete annotation"),
            ("publish_annotation", "publish relationship"),
        )

        indexes = [
            django.db.models.Index(fields=["page"]),
            django.db.models.Index(fields=["annotation_label"]),
            django.db.models.Index(fields=["document"]),
            django.db.models.Index(fields=["document", "creator"]),
            django.db.models.Index(fields=["corpus"]),
            django.db.models.Index(fields=["corpus", "creator"]),
            django.db.models.Index(fields=["document", "corpus"]),
            django.db.models.Index(fields=["document", "corpus", "creator"]),
            django.db.models.Index(fields=["analysis"]),
            django.db.models.Index(fields=["creator"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
        ]


# Model for Django Guardian permissions.
class AnnotationUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Annotation", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class AnnotationGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Annotation", on_delete=django.db.models.CASCADE
    )
    # enabled = False


def calculate_labelset_icon_path(instance, filename):
    return calc_oc_file_path(
        instance, filename, f"user_{instance.creator.id}/labelsets/icons/{uuid.uuid4()}"
    )


class LabelSet(BaseOCModel):
    """
    Label set object which stores a collection of:
     1) text labels,
     2) text label relationship labels,
     3) document labels and
     4) document relationship labels
    """

    # Basic metadata:
    title = django.db.models.CharField(max_length=1024, db_index=True)
    description = django.db.models.TextField(default="", blank=False)
    icon = django.db.models.FileField(
        blank=True, upload_to=calculate_labelset_icon_path
    )

    # For relational test...
    annotation_labels = django.db.models.ManyToManyField(
        AnnotationLabel,
        blank=True,
        related_name="included_in_labelsets",
        related_query_name="included_in_labelset",
    )

    # If this is created by an analyzer, let's link to it
    analyzer = django.db.models.ForeignKey(
        "analyzer.Analyzer", on_delete=django.db.models.SET_NULL, null=True, blank=True
    )

    class Meta:
        permissions = (
            ("permission_labelset", "Can permission labelset"),
            ("publish_labelset", "Can publish labelset"),
            ("create_labelset", "Can create labelset"),
            ("read_labelset", "Can read labelset"),
            ("update_labelset", "Can update labelset"),
            ("remove_labelset", "Can delete labelset"),
        )

        indexes = [
            django.db.models.Index(fields=["title"]),
            django.db.models.Index(fields=["analyzer"]),
            django.db.models.Index(fields=["creator"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
        ]

        constraints = [
            django.db.models.UniqueConstraint(
                fields=["analyzer", "title"],
                name="Only install one labelset of given title for each analyzer (no duplicates)",
            )
        ]


# Model for Django Guardian permissions...
class LabelSetUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "LabelSet", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions...
class LabelSetGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "LabelSet", on_delete=django.db.models.CASCADE
    )
    # enabled = False


class Note(BaseOCModel, HasEmbeddingMixin):
    """
    Notes model for attaching hierarchical comments/notes to documents.
    Uses django_cte for hierarchical relationships.
    """

    objects = NoteManager()

    # Content
    title = django.db.models.CharField(max_length=1024, db_index=True)
    content = django.db.models.TextField(default="", blank=True)

    # Vector for vector search - legacy field, will be deprecated
    embedding = VectorField(dimensions=384, null=True)
    
    # New relationship to the Embedding model
    embeddings = django.db.models.ForeignKey(
        "annotations.Embedding",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="notes",
    )

    # Hierarchical relationship
    parent = django.db.models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=django.db.models.CASCADE,
    )

    corpus = django.db.models.ForeignKey(
        "corpuses.Corpus",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="notes",
    )

    # Document reference
    document = django.db.models.ForeignKey(
        "documents.Document",
        null=False,
        on_delete=django.db.models.CASCADE,
        related_name="notes",
    )

    # Optional reference to specific annotation
    annotation = django.db.models.ForeignKey(
        "annotations.Annotation",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="notes",
    )

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=False,
    )

    # Timing variables
    created = django.db.models.DateTimeField(default=timezone.now)
    modified = django.db.models.DateTimeField(default=timezone.now, blank=True)

    def get_embedding_reference_kwargs(self) -> dict:
        return {"note_id": self.pk}

    class Meta:
        permissions = (
            ("permission_note", "permission note"),
            ("publish_note", "publish note"),
            ("create_note", "create note"),
            ("read_note", "read note"),
            ("update_note", "update note"),
            ("remove_note", "delete note"),
        )
        indexes = [
            django.db.models.Index(fields=["title"]),
            django.db.models.Index(fields=["document"]),
            django.db.models.Index(fields=["annotation"]),
            django.db.models.Index(fields=["creator"]),
            django.db.models.Index(fields=["created"]),
            django.db.models.Index(fields=["modified"]),
            django.db.models.Index(fields=["parent"]),
            django.db.models.Index(fields=["corpus"]),
        ]
        ordering = ("created",)

    def save(self, *args, **kwargs):
        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()
        return super().save(*args, **kwargs)


# Model for Django Guardian permissions
class NoteUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Note", on_delete=django.db.models.CASCADE
    )


# Model for Django Guardian permissions
class NoteGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Note", on_delete=django.db.models.CASCADE
    )
