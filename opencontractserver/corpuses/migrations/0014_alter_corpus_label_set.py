# Generated by Django 4.2.16 on 2024-09-15 20:50

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        (
            "annotations",
            "0017_remove_annotationlabel_only_install_one_label_of_given_name_for_each_analyzer_id_no_duplicates__and_",
        ),
        ("corpuses", "0013_corpus_allow_comments"),
    ]

    operations = [
        migrations.AlterField(
            model_name="corpus",
            name="label_set",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="used_by_corpuses",
                related_query_name="used_by_corpus",
                to="annotations.labelset",
            ),
        ),
    ]
