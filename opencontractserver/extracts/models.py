import django
from django.contrib.auth import get_user_model
from django.utils import timezone
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase
from pgvector.django import VectorField

from opencontractserver.corpuses.models import Corpus
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()


class LanguageModel(BaseOCModel):

    model = django.db.models.CharField(max_length=256, null=False, blank=False)

    class Meta:
        permissions = (
            ("permission_languagemodel", "permission language model"),
            ("create_languagemodel", "create language model"),
            ("read_languagemodel", "read language model"),
            ("update_languagemodel", "update language model"),
            ("remove_languagemodel", "delete language model"),
        )


class LanguageModelUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "LanguageModel", on_delete=django.db.models.CASCADE
    )


class LanguageModelGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "LanguageModel", on_delete=django.db.models.CASCADE
    )


class Fieldset(BaseOCModel):
    owner = django.db.models.ForeignKey(
        User,
        related_name="fieldsets",
        null=False,
        blank=False,
        on_delete=django.db.models.CASCADE,
    )
    name = django.db.models.CharField(max_length=256, null=False, blank=False)
    description = django.db.models.TextField(null=False, blank=False)

    class Meta:
        permissions = (
            ("permission_fieldset", "permission fieldset"),
            ("create_fieldset", "create fieldset"),
            ("read_fieldset", "read fieldset"),
            ("update_fieldset", "update fieldset"),
            ("remove_fieldset", "delete fieldset"),
        )


class FieldsetUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Fieldset", on_delete=django.db.models.CASCADE
    )


class FieldsetGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Fieldset", on_delete=django.db.models.CASCADE
    )


class Column(BaseOCModel):
    fieldset = django.db.models.ForeignKey(
        "Fieldset", related_name="columns", on_delete=django.db.models.CASCADE
    )

    # TODO - Should set up validations so EITHER of these can be null but not both.
    query = django.db.models.TextField(null=False, blank=False)
    match_text = django.db.models.TextField(null=False, blank=False)

    output_type = django.db.models.TextField(null=False, blank=False)
    limit_to_label = django.db.models.CharField(max_length=512, null=True, blank=True)
    instructions = django.db.models.TextField(null=True, blank=True)
    language_model = django.db.models.ForeignKey(
        "LanguageModel", on_delete=django.db.models.PROTECT, null=False, blank=False
    )
    agentic = django.db.models.BooleanField(default=False)

    class Meta:
        permissions = (
            ("permission_column", "permission column"),
            ("create_column", "create column"),
            ("read_column", "read column"),
            ("update_column", "update column"),
            ("remove_column", "delete column"),
        )


class ColumnUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Column", on_delete=django.db.models.CASCADE
    )


class ColumnGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Column", on_delete=django.db.models.CASCADE
    )


class Extract(BaseOCModel):
    corpus = django.db.models.ForeignKey(
        Corpus,
        related_name="extracts",
        on_delete=django.db.models.CASCADE,
        null=False,
        blank=False,
    )
    name = django.db.models.CharField(max_length=512, null=False, blank=False)
    fieldset = django.db.models.ForeignKey(
        "Fieldset",
        related_name="extracts",
        on_delete=django.db.models.PROTECT,
        null=False,
    )
    owner = django.db.models.ForeignKey(
        django.contrib.auth.get_user_model(),
        related_name="owned_extracts",
        on_delete=django.db.models.PROTECT,
        null=False,
    )
    created = django.db.models.DateTimeField(auto_now_add=True)
    started = django.db.models.DateTimeField(null=True, blank=True)
    finished = django.db.models.DateTimeField(null=True, blank=True)
    stacktrace = django.db.models.TextField(null=True, blank=True)

    class Meta:
        permissions = (
            ("permission_extract", "permission extract"),
            ("create_extract", "create extract"),
            ("read_extract", "read extract"),
            ("update_extract", "update extract"),
            ("remove_extract", "delete extract"),
        )


class ExtractUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Extract", on_delete=django.db.models.CASCADE
    )


class ExtractGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Extract", on_delete=django.db.models.CASCADE
    )


class Row(BaseOCModel):
    extract = django.db.models.ForeignKey(
        "Extract", related_name="rows", on_delete=django.db.models.CASCADE
    )
    column = django.db.models.ForeignKey(
        "Column", related_name="rows", on_delete=django.db.models.CASCADE
    )
    data = NullableJSONField()
    data_definition = django.db.models.TextField(null=False, blank=False)
    started = django.db.models.DateTimeField(null=True, blank=True)
    completed = django.db.models.DateTimeField(null=True, blank=True)
    failed = django.db.models.DateTimeField(null=True, blank=True)
    stacktrace = django.db.models.TextField(null=True, blank=True)

    class Meta:
        permissions = (
            ("permission_row", "permission row"),
            ("create_row", "create row"),
            ("read_row", "read row"),
            ("update_row", "update row"),
            ("remove_row", "delete row"),
        )


class RowUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Row", on_delete=django.db.models.CASCADE
    )


class RowGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Row", on_delete=django.db.models.CASCADE
    )
