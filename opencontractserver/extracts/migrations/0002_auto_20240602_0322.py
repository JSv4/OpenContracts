# Generated by Django 3.2.9 on 2024-06-02 03:22

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0005_document_embedding'),
        ('extracts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='column',
            name='name',
            field=models.CharField(default='', max_length=256),
        ),
        migrations.AlterField(
            model_name='datacell',
            name='column',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='extracted_datacells', to='extracts.column'),
        ),
        migrations.AlterField(
            model_name='datacell',
            name='document',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='extracted_datacells', to='documents.document'),
        ),
        migrations.AlterField(
            model_name='datacell',
            name='extract',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='extracted_datacells', to='extracts.extract'),
        ),
    ]
