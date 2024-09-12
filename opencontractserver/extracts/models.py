import django
from django.contrib.auth import get_user_model
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()


class Fieldset(BaseOCModel):
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
    name = django.db.models.CharField(
        max_length=256, null=False, blank=False, default=""
    )
    fieldset = django.db.models.ForeignKey(
        "Fieldset", related_name="columns", on_delete=django.db.models.CASCADE
    )

    # TODO - Should set up validations so EITHER of these can be null but not both.
    query = django.db.models.TextField(null=True, blank=True)
    match_text = django.db.models.TextField(null=True, blank=True)
    must_contain_text = django.db.models.TextField(null=True, blank=True)

    output_type = django.db.models.TextField(null=False, blank=False)
    limit_to_label = django.db.models.CharField(max_length=512, null=True, blank=True)
    instructions = django.db.models.TextField(null=True, blank=True)
    agentic = django.db.models.BooleanField(default=False)
    extract_is_list = django.db.models.BooleanField(default=False)
    task_name = django.db.models.CharField(
        max_length=1024,
        null=False,
        blank=False,
        default="opencontractserver.tasks.data_extract_tasks.oc_llama_index_doc_query",
    )

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
        on_delete=django.db.models.SET_NULL,
        null=True,
        blank=True,
    )
    documents = django.db.models.ManyToManyField(
        Document,
        related_name="extracts",
        related_query_name="extract",
        blank=True,
    )
    name = django.db.models.CharField(max_length=512, null=False, blank=False)
    fieldset = django.db.models.ForeignKey(
        "Fieldset",
        related_name="extracts",
        on_delete=django.db.models.PROTECT,
        null=False,
    )
    created = django.db.models.DateTimeField(auto_now_add=True)
    started = django.db.models.DateTimeField(null=True, blank=True)
    finished = django.db.models.DateTimeField(null=True, blank=True)
    error = django.db.models.TextField(null=True, blank=True)

    # If applicable, what CorpusAction ran?
    corpus_action = django.db.models.ForeignKey(
        "corpuses.CorpusAction",
        related_name="extracts",
        blank=True,
        null=True,
        on_delete=django.db.models.SET_NULL,
    )

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


class Datacell(BaseOCModel):
    extract = django.db.models.ForeignKey(
        "Extract",
        related_name="extracted_datacells",
        on_delete=django.db.models.CASCADE,
    )
    column = django.db.models.ForeignKey(
        "Column", related_name="extracted_datacells", on_delete=django.db.models.CASCADE
    )
    document = django.db.models.ForeignKey(
        Document, related_name="extracted_datacells", on_delete=django.db.models.CASCADE
    )
    sources = django.db.models.ManyToManyField(
        Annotation,
        blank=True,
        related_name="referencing_cells",
        related_query_name="referencing_cell",
    )
    data = NullableJSONField(default=jsonfield_default_value, null=True, blank=True)
    data_definition = django.db.models.TextField(null=False, blank=False)
    started = django.db.models.DateTimeField(null=True, blank=True)
    completed = django.db.models.DateTimeField(null=True, blank=True)
    failed = django.db.models.DateTimeField(null=True, blank=True)
    stacktrace = django.db.models.TextField(null=True, blank=True)

    approved_by = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=True,
        blank=True,
        related_name="approved_cells",
    )
    rejected_by = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=True,
        blank=True,
        related_name="rejected_cells",
    )
    corrected_data = NullableJSONField(
        default=jsonfield_default_value, null=True, blank=True
    )

    class Meta:
        permissions = (
            ("permission_datacell", "permission datacell"),
            ("create_datacell", "create datacell"),
            ("read_datacell", "read datacell"),
            ("update_datacell", "update datacell"),
            ("remove_datacell", "delete datacell"),
        )


class DatacellUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Datacell", on_delete=django.db.models.CASCADE
    )


class DatacellGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Datacell", on_delete=django.db.models.CASCADE
    )
