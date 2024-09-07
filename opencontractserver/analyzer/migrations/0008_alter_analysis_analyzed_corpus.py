# Generated by Django 4.2.15 on 2024-09-06 05:41

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("corpuses", "0012_corpusaction_disabled_and_more"),
        ("analyzer", "0007_analysis_corpus_action"),
    ]

    operations = [
        migrations.AlterField(
            model_name="analysis",
            name="analyzed_corpus",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="analyses",
                to="corpuses.corpus",
            ),
        ),
    ]