# Generated by Django 3.2.9 on 2024-06-08 21:30

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('corpuses', '0004_corpusquerygroupobjectpermission_corpusqueryuserobjectpermission'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='corpusquery',
            options={'base_manager_name': 'objects', 'ordering': ('created',), 'permissions': (('permission_corpusquery', 'permission corpusquery'), ('publish_corpusquery', 'publish corpusquery'), ('create_corpusquery', 'create corpusquery'), ('read_corpusquery', 'read corpusquery'), ('update_corpusquery', 'update corpusquery'), ('remove_corpusquery', 'delete corpusquery'))},
        ),
    ]
