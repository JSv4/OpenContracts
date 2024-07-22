# Generated by Django 3.2.9 on 2024-07-22 07:10

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('annotations', '0007_auto_20240722_0709'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['label_type'], name='annotations_label_t_127ad3_idx'),
        ),
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['analyzer'], name='annotations_analyze_be375d_idx'),
        ),
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['text'], name='annotations_text_164e9f_idx'),
        ),
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['creator'], name='annotations_creator_3841c2_idx'),
        ),
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['created'], name='annotations_created_8a7d6b_idx'),
        ),
        migrations.AddIndex(
            model_name='annotationlabel',
            index=models.Index(fields=['modified'], name='annotations_modifie_353160_idx'),
        ),
    ]