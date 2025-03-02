from django.contrib import admin
from guardian.admin import GuardedModelAdmin

from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine

# 1. Import your new utility
from opencontractserver.analyzer.utils import auto_create_doc_analyzers


@admin.register(GremlinEngine)
class GremlinEngineAdmin(GuardedModelAdmin):
    list_display = ["id", "url", "install_started", "install_completed"]


@admin.register(Analyzer)
class AnalyzerAdmin(GuardedModelAdmin):
    list_display = ["id", "description", "task_name", "host_gremlin"]

    # 2. Define an admin action
    actions = ["reload_doc_analyzers"]

    def reload_doc_analyzers(self, request, queryset):
        """
        Reload doc_analyzer_task-based analyzers by calling our shared auto_create_doc_analyzers function.
        """
        from django.contrib.auth import get_user_model

        AnalyzerModel = Analyzer  # The 'real' Analyzer model (live)
        RealUserModel = get_user_model()
        # Optionally, you can keep fallback_superuser to True so it tries superuser first.
        auto_create_doc_analyzers(AnalyzerModel=AnalyzerModel, UserModel=RealUserModel)

        self.message_user(request, "Successfully reloaded doc-based analyzers.")

    reload_doc_analyzers.short_description = "Reload doc-based analyzers from tasks"


@admin.register(Analysis)
class AnalysisAdmin(GuardedModelAdmin):
    list_display = ["id", "analysis_started", "analysis_completed", "status"]
    search_fields = [
        "id",
        "analyzer__id",
        "analyzed_corpus__title",
        "creator__username",
    ]
    list_filter = ("status", "created", "analysis_started", "analysis_completed")
    raw_id_fields = (
        "analyzer",
        "analyzed_corpus",
        "corpus_action",
        "creator",
        "analyzed_documents",
    )
    date_hierarchy = "created"
