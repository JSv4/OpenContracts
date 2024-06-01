from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.extracts.models import Extract, Column, Datacell, Fieldset, LanguageModel


@admin.register(Fieldset)
class FieldsetAdmin(GuardedModelAdmin):
    list_display = ["id", "name", "description", "owner"]


@admin.register(Column)
class ColumnAdmin(GuardedModelAdmin):
    list_display = ["id", "query", "match_text", "output_type", "agentic"]


@admin.register(Extract)
class ExtractAdmin(GuardedModelAdmin):
    list_display = ["id", "name"]


@admin.register(LanguageModel)
class LanguageModelAdmin(GuardedModelAdmin):
    list_display = ["id", "model"]
