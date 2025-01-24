# Register your models here.
from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.conversations.models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(GuardedModelAdmin):
    list_display_links = ["id", "title"]
    list_display = [
        "id",
        "title",
        "created_at",
    ]
    search_fields = ["id", "title", "creator__username"]
    list_filter = ("is_public", "created", "modified", "error", "backend_lock")
    raw_id_fields = ("creator", "chat_with_document", "chat_with_corpus")
    date_hierarchy = "created_at"


@admin.register(Message)
class MessageAdmin(GuardedModelAdmin):
    list_display_links = ["id"]
    list_display = [
        "id",
        "msg_type",
        "content",
        "created_at",
        "source_document",
    ]
    search_fields = ["id", "content", "creator__username"]
    list_filter = ("msg_type",)
    raw_id_fields = (
        "creator",
        "created_annotations",
        "source_annotations",
        "source_document",
    )
    date_hierarchy = "created_at"
