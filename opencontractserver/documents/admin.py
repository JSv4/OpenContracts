from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.documents.models import Document


@admin.register(Document)
class DocumentAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description", "backend_lock", "user_lock"]
