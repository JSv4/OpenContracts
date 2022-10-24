from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.analyzer.models import Analysis, GremlinEngine


@admin.register(GremlinEngine)
class GremlinEngineAdmin(GuardedModelAdmin):
    list_display = ["id", "url", "install_started", "install_completed"]


@admin.register(Analysis)
class AnalysisAdmin(GuardedModelAdmin):
    list_display = ["id"]
