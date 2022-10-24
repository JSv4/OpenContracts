from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.corpuses.models import Corpus


@admin.register(Corpus)
class CorpusAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description", "backend_lock", "user_lock"]
