from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.documents.models import Document, DocumentAnalysisRow


@admin.register(Document)
class DocumentAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description", "backend_lock", "user_lock"]


@admin.register(DocumentAnalysisRow)
class DocumentAnalysisRowAdmin(GuardedModelAdmin):
    list_display = ["id", "document", "analysis", "extract", "creator"]
