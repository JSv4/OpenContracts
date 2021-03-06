# Generated by Django 3.2.9 on 2022-04-02 14:44

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import opencontractserver.shared.defaults
import opencontractserver.shared.fields


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Document',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(blank=True, max_length=1024, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('custom_meta', opencontractserver.shared.fields.NullableJSONField(blank=True, default=opencontractserver.shared.defaults.jsonfield_default_value, null=True)),
                ('icon', models.FileField(blank=True, max_length=1024, upload_to='opencontracts/pdf_icons/')),
                ('pdf_file', models.FileField(max_length=1024, upload_to='opencontracts/pdf/')),
                ('txt_extract_file', models.FileField(blank=True, max_length=1024, null=True, upload_to='opencontracts/txt/')),
                ('pawls_parse_file', models.FileField(blank=True, max_length=1024, null=True, upload_to='opencontracts/token_files/')),
                ('backend_lock', models.BooleanField(default=False)),
                ('is_public', models.BooleanField(default=False)),
                ('created', models.DateTimeField(default=django.utils.timezone.now, verbose_name='Creation Date and Time')),
                ('modified', models.DateTimeField(blank=True, default=django.utils.timezone.now)),
            ],
            options={
                'permissions': (('permission_document', 'permission document'), ('publish_document', 'publish document'), ('create_document', 'create document'), ('read_document', 'read document'), ('update_document', 'update document'), ('remove_document', 'delete document')),
            },
        ),
        migrations.CreateModel(
            name='DocumentGroupObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='DocumentUserObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_object', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='documents.document')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.permission')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
