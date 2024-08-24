from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.corpuses.models import Corpus, CorpusQuery, CorpusAction


@admin.register(Corpus)
class CorpusAdmin(GuardedModelAdmin):
    list_display = ["id", "title", "description", "backend_lock", "user_lock"]


@admin.register(CorpusAction)
class CorpusActionAdmin(GuardedModelAdmin):
    list_display = ["id", "name", "corpus"]


@admin.register(CorpusQuery)
class CorpusQueryAdmin(GuardedModelAdmin):
    list_display = ["id", "query", "failed", "completed", "started"]
