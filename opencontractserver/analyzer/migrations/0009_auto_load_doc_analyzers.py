"""
Data migration that calls our shared auto_create_doc_analyzers function
to detect @doc_analyzer_task tasks and create Analyzer entries if not present.
"""

from django.db import migrations

def create_doc_analyzers(apps, schema_editor) -> None:
    from opencontractserver.analyzer.utils import auto_create_doc_analyzers

    # We want the 'historical' version of the models
    Analyzer = apps.get_model("analyzer", "Analyzer")
    HistoricalUser = apps.get_model("users", "User")  # or your custom user app, e.g. ("myapp", "MyUser")

    # Then simply call the utility
    auto_create_doc_analyzers(
        AnalyzerModel=Analyzer,
        UserModel=HistoricalUser,
        fallback_superuser=True,
    )

class Migration(migrations.Migration):

    dependencies = [
        ("analyzer", "0008_alter_analysis_analyzed_corpus"),
    ]

    operations = [
        migrations.RunPython(create_doc_analyzers),
    ] 