from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine


@admin.register(GremlinEngine)
class GremlinEngineAdmin(GuardedModelAdmin):
    list_display = ["id", "url", "install_started", "install_completed"]


@admin.register(Analyzer)
class AnalyzerAdmin(GuardedModelAdmin):
    list_display = ["id", "description", "task_name", "host_gremlin"]


@admin.register(Analysis)
class AnalysisAdmin(GuardedModelAdmin):
    list_display = ["id"]
