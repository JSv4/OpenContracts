# Generated by Django 3.2.9 on 2023-02-02 06:04

from django.db import migrations, models
import opencontractserver.shared.defaults
import opencontractserver.shared.fields


class Migration(migrations.Migration):

    dependencies = [
        ('annotations', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='annotation',
            name='tokens_jsons',
            field=opencontractserver.shared.fields.NullableJSONField(blank=True, default=opencontractserver.shared.defaults.jsonfield_empty_array, null=True),
        ),
        migrations.AlterField(
            model_name='annotationlabel',
            name='label_type',
            field=models.CharField(choices=[('RELATIONSHIP_LABEL', 'Relationship label.'), ('DOC_TYPE_LABEL', 'Document-level type label.'), ('TOKEN_LABEL', 'Token-level labels for spans and NER labeling'), ('METADATA_LABEL', 'Metadata label for manual entry field')], default='TOKEN_LABEL', max_length=128),
        ),
    ]
