import functools
import uuid

import django
from django.contrib.auth import get_user_model
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel
from opencontractserver.shared.utils import calc_oc_file_path
from opencontractserver.types.enums import JobStatus


def calculate_analyzer_icon_path(instance, filename):
    return calc_oc_file_path(
        instance, filename, f"user_{instance.creator.id}/analyzers/icons/{uuid.uuid4()}"
    )


class GremlinEngine(BaseOCModel):
    class Meta:
        permissions = (
            ("permission_gremlinengine", "permission gremlin engine"),
            ("publish_gremlinengine", "publish gremlin engine"),
            ("create_gremlinengine", "create gremlin engine"),
            ("read_gremlinengine", "read gremlin engine"),
            ("update_gremlinengine", "update gremlin engine"),
            ("remove_gremlinengine", "delete gremlin engine"),
        )

    url = django.db.models.CharField(
        max_length=1024,
        blank=False,
        null=False,
    )

    # Anticipating that you may have totally unauthenticated Gremlin Engine
    api_key = django.db.models.CharField(
        max_length=1024,
        blank=True,
        null=True,
    )

    last_synced = django.db.models.DateTimeField(
        "Creation Date and Time", blank=True, null=True
    )
    install_started = django.db.models.DateTimeField(
        "Install Started", blank=True, null=True
    )
    install_completed = django.db.models.DateTimeField(
        "Install Completed", blank=True, null=True
    )
    is_public = django.db.models.BooleanField(default=True)


class GremlinEngineUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "GremlinEngine", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class GremlinEngineGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "GremlinEngine", on_delete=django.db.models.CASCADE
    )
    # enabled = False


class Analyzer(BaseOCModel):
    class Meta:
        permissions = (
            ("permission_analyzer", "permission analyzer"),
            ("publish_analyzer", "publish analyzer"),
            ("create_analyzer", "create analyzer"),
            ("read_analyzer", "read analyzer"),
            ("update_analyzer", "update analyzer"),
            ("remove_analyzer", "delete analyzer"),
        )

    id = django.db.models.CharField(max_length=1024, primary_key=True)

    # Tracking information to tie this back to the OC Analyzer that was used to create it.
    manifest = NullableJSONField(default=jsonfield_default_value, null=True, blank=True)
    description = django.db.models.TextField(null=False, blank=True, default="")
    host_gremlin = django.db.models.ForeignKey(
        GremlinEngine, blank=False, null=False, on_delete=django.db.models.CASCADE
    )
    disabled = django.db.models.BooleanField(default=False)
    is_public = django.db.models.BooleanField(default=True)
    icon = django.db.models.FileField(
        blank=True, upload_to=calculate_analyzer_icon_path
    )


class AnalyzerUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Analyzer", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class AnalyzerGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Analyzer", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Create your models here.
class Analysis(BaseOCModel):
    """
    Okay, this is duplicative of new Extracts objects... I can probably make this pull double duty
    BUT I think the more expeditious approach here is to just start fresh and leave this for now but
    Eventually replace it or merge the two concepts.

    For now, the distinction is extracts are not annotating the documents directly but rather tracking where
    information is coming from - so we can still jump into the document - but storing extracted information for
    export as a csv.
    """


    class Meta:
        permissions = (
            ("create_analysis", "create Analysis"),
            ("read_analysis", "read Analysis"),
            ("update_analysis", "update Analysis"),
            ("remove_analysis", "delete Analysis"),
            ("publish_analysis", "publish Analysis"),
            ("permission_analysis", "permission Analysis"),
        )

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.CASCADE,
        null=False,
        default=1,
    )

    # Tracking information to tie this back to the OC Analyzer that was used to create it.
    analyzer = django.db.models.ForeignKey(
        Analyzer,
        null=False,
        blank=False,
        on_delete=django.db.models.CASCADE
    )

    # For (ok) security on results, the callback for a given analyzer will require a TOKEN header of uuid v4
    callback_token = django.db.models.UUIDField(default=uuid.uuid4, editable=False)

    received_callback_file = django.db.models.FileField(
        max_length=1024,
        blank=True,
        null=True,
        upload_to=functools.partial(calc_oc_file_path, sub_folder="pdf_files"),
    )

    # Which corpus was analyzed
    analyzed_corpus = django.db.models.ForeignKey(
        Corpus,
        on_delete=django.db.models.CASCADE,
        related_name="analyses",
        blank=False,
        null=False,
    )

    import_log = django.db.models.TextField(blank=True, null=True)

    # More for future use - if we are not analyzing an entire corpus but a subset
    # or, potentially, just a random selection of documents, which documents were analyzed?
    # For starters, just analyze entire corpus.
    analyzed_documents = django.db.models.ManyToManyField(
        "documents.Document", related_name="included_in_analyses", blank=True
    )

    # Timing variables
    analysis_started = django.db.models.DateTimeField(blank=True, null=True)
    analysis_completed = django.db.models.DateTimeField(blank=True, null=True)
    status = django.db.models.CharField(
        max_length=24, choices=JobStatus.choices(), default=JobStatus.CREATED.value
    )


# Model for Django Guardian permissions.
class AnalysisUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Analysis", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class AnalysisGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Analysis", on_delete=django.db.models.CASCADE
    )
    # enabled = False
