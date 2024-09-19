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
    search_fields = ['id', 'analyzer__id', 'analyzed_corpus__title', 'creator__username']
    list_filter = ('status', 'created', 'analysis_started', 'analysis_completed')
    raw_id_fields = ('analyzer', 'analyzed_corpus', 'corpus_action', 'creator', 'analyzed_documents')
    date_hierarchy = 'created'
