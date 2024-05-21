import uuid

import django
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.shared.defaults import (
    empty_bounding_box,
    jsonfield_default_value,
    jsonfield_empty_array,
)
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel
from opencontractserver.shared.utils import calc_oc_file_path

# TODO - can we use the Python enum in data_types.py to drive choices
RELATIONSHIP_LABEL = "RELATIONSHIP_LABEL"
DOC_TYPE_LABEL = "DOC_TYPE_LABEL"
TOKEN_LABEL = "TOKEN_LABEL"
METADATA_LABEL = "METADATA_LABEL"

LABEL_TYPES = [
    (RELATIONSHIP_LABEL, _("Relationship label.")),
    (DOC_TYPE_LABEL, _("Document-level type label.")),
    (TOKEN_LABEL, _("Token-level labels for spans and NER labeling")),
    (METADATA_LABEL, _("Metadata label for manual entry field")),
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
        "analyzer.Analyzer", on_delete=django.db.models.SET_NULL, null=True, blank=True
    )

    # If this is meant to be a 'built-in' label and be used across corpuses without being explicitly added to a
    # labelset, set this value to True
    read_only = django.db.models.BooleanField(default=False)

    color = django.db.models.CharField(
        max_length=12, blank=False, null=False, default="#ffff00"
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

        constraints = [
            django.db.models.UniqueConstraint(
                fields=["analyzer", "text"],
                name="Only install one label of given name for each analyzer_id (no duplicates)",
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
        "AnnotationLabel", null=True, on_delete=django.db.models.CASCADE
    )
    corpus = django.db.models.ForeignKey(
        "corpuses.Corpus", null=True, on_delete=django.db.models.CASCADE
    )
    document = django.db.models.ForeignKey(
        "documents.Document", null=False, on_delete=django.db.models.CASCADE
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


class Annotation(BaseOCModel):
    page = django.db.models.IntegerField(default=1, blank=False)
    raw_text = django.db.models.TextField(null=True, blank=True)
    tokens_jsons = NullableJSONField(
        default=jsonfield_empty_array, null=True, blank=True
    )
    bounding_box = NullableJSONField(default=empty_bounding_box, null=False)
    json = NullableJSONField(default=jsonfield_default_value, null=False)

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

    # If this annotation was created as part of an analysis... track that.
    analysis = django.db.models.ForeignKey(
        "analyzer.Analysis",
        null=True,
        blank=True,
        on_delete=django.db.models.SET_NULL,
        related_name="annotations",
    )

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
            ("permission_annotation", "permission annotation"),
            ("create_annotation", "create annotation"),
            ("read_annotation", "read annotation"),
            ("update_annotation", "update annotation"),
            ("remove_annotation", "delete annotation"),
            ("publish_annotation", "publish relationship"),
        )

    # Override save to update modified on save
    def save(self, *args, **kwargs):
        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()

        return super().save(*args, **kwargs)


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
