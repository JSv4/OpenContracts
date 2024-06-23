# Generated by Django 3.2.9 on 2024-05-19 20:52

from django.db import migrations
import pgvector.django


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0004_add_pgvector'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='embedding',
            field=pgvector.django.VectorField(dimensions=384, null=True),
        ),
    ]