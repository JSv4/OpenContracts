import functools

import django
from django.utils import timezone
from pgvector.django import VectorField
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel
from opencontractserver.shared.utils import calc_oc_file_path


# Create your models here.
class Document(BaseOCModel):

    """
    Document
    """

    # Key fields
    title = django.db.models.CharField(max_length=1024, null=True, blank=True)
    description = django.db.models.TextField(null=True, blank=True)
    custom_meta = NullableJSONField(
        default=jsonfield_default_value, null=True, blank=True
    )

    # File fields (Some of these are text blobs or jsons that could be huge, so we're storing them in S3 and going
    # to have the frontend fetch them from there. Will be much faster and cheaper than having a huge relational database
    # full of these kinds of things).
    icon = django.db.models.FileField(
        max_length=1024,
        blank=True,
        upload_to=functools.partial(calc_oc_file_path, sub_folder="pdf_icons"),
    )
    pdf_file = django.db.models.FileField(
        max_length=1024,
        blank=False,
        null=False,
        upload_to=functools.partial(calc_oc_file_path, sub_folder="pdf_files"),
    )
    txt_extract_file = django.db.models.FileField(
        max_length=1024,
        blank=True,
        upload_to=functools.partial(calc_oc_file_path, sub_folder="txt_layers_files"),
        null=True,
    )
    page_count = django.db.models.IntegerField(
        default=-1,  # insane default to make it easy to find unhandled docs
        null=False,
        blank=True,
    )
    pawls_parse_file = django.db.models.FileField(
        max_length=1024,
        blank=True,
        upload_to=functools.partial(calc_oc_file_path, sub_folder="pawls_layers_files"),
        null=True,
    )

    # Vector for vector search
    embedding = VectorField(dimensions=384, null=True)

    class Meta:
        permissions = (
            ("permission_document", "permission document"),
            ("publish_document", "publish document"),
            ("create_document", "create document"),
            ("read_document", "read document"),
            ("update_document", "update document"),
            ("remove_document", "delete document"),
        )

    # Override save to update modified on save
    def save(self, *args, **kwargs):

        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()

        return super().save(*args, **kwargs)

    def __str__(self):
        """
        String representation method
        :return:
        """
        return f"Doc ({self.id}) - {self.description}".encode("utf-8", "ignore").decode(
            "utf-8", "ignore"
        )


# Model for Django Guardian permissions... trying to improve performance...
class DocumentUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Document", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions... trying to improve performance...
class DocumentGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Document", on_delete=django.db.models.CASCADE
    )
    # enabled = False
