from django.contrib import admin
from django.utils.safestring import mark_safe
from guardian.admin import GuardedModelAdmin

from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusQuery
from opencontractserver.tasks.permissioning_tasks import make_corpus_public_task


@admin.register(Corpus)
class CorpusAdmin(GuardedModelAdmin):
    list_display_links = ["id", "title"]
    list_select_related = ("creator", "label_set")
    list_display = [
        "id",
        "display_icon",
        "is_public",
        "allow_comments",
        "title",
        "description",
        "backend_lock",
        "user_lock",
    ]
    search_fields = ["id", "title", "description", "creator__username"]
    list_filter = ("is_public", "created", "modified", "error", "backend_lock")
    actions = ["make_public"]
    raw_id_fields = ("creator", "user_lock", "documents", "label_set")
    date_hierarchy = "created"

    def display_icon(self, obj):
        if obj.icon:
            return mark_safe(f'<img src="{obj.icon.url}" width="50" height="50" />')
        return "No icon"

    display_icon.short_description = "Icon"

    def make_public(self, request, queryset):
        for corpus in queryset:
            make_corpus_public_task.si(corpus_id=corpus.pk).apply_async()
        self.message_user(
            request, f"Started making {queryset.count()} corpus(es) public."
        )

    make_public.short_description = "Make selected corpuses public"


@admin.register(CorpusAction)
class CorpusActionAdmin(GuardedModelAdmin):
    list_display = ["id", "name", "corpus"]


@admin.register(CorpusQuery)
class CorpusQueryAdmin(GuardedModelAdmin):
    list_display = ["id", "query", "failed", "completed", "started"]
