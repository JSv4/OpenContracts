from django.db import models
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.annotations.models import Annotation
from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel


class UserFeedback(BaseOCModel):
    approved = models.BooleanField(default=False)
    rejected = models.BooleanField(default=False)
    comment = models.TextField(blank=True, default="", null=False)
    markdown = models.TextField(blank=True, default="", null=False)
    metadata = NullableJSONField(default=jsonfield_default_value, null=True, blank=True)
    commented_annotation = models.ForeignKey(
        Annotation,
        on_delete=models.CASCADE,
        blank=False,
        null=False,
        related_name="user_feedback",
    )

    class Meta:
        permissions = (
            ("permission_userfeedback", "permission UserFeedback"),
            ("publish_userfeedback", "publish UserFeedback"),
            ("create_userfeedback", "create UserFeedback"),
            ("read_userfeedback", "read UserFeedback"),
            ("update_userfeedback", "update UserFeedback"),
            ("remove_userfeedback", "delete UserFeedback"),
        )


# Model for Django Guardian permissions... trying to improve performance...
class UserFeedbackObjectPermission(UserObjectPermissionBase):
    content_object = models.ForeignKey("UserFeedback", on_delete=models.CASCADE)
    # enabled = False


# Model for Django Guardian permissions... trying to improve performance...
class UserFeedbackGroupObjectPermission(GroupObjectPermissionBase):
    content_object = models.ForeignKey("UserFeedback", on_delete=models.CASCADE)
    # enabled = False
