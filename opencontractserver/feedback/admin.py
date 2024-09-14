from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.feedback.models import UserFeedback


@admin.register(UserFeedback)
class AnnotationAdmin(GuardedModelAdmin):
    list_display = ["id", "approved", "rejected", "comment", "creator"]
    list_filter = ("approved", "rejected")
