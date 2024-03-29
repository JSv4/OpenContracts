# Generated by Django 3.2.9 on 2022-10-15 21:40

from django.db import migrations, models
import django.db.models.deletion
import functools
import opencontractserver.analyzer.models
import opencontractserver.shared.defaults
import opencontractserver.shared.fields
import opencontractserver.shared.utils
import opencontractserver.types.dicts
import opencontractserver.types.enums
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Analysis',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('backend_lock', models.BooleanField(default=False)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('is_public', models.BooleanField(default=False)),
                ('callback_token', models.UUIDField(default=uuid.uuid4, editable=False)),
                ('received_callback_file', models.FileField(blank=True, max_length=1024, null=True, upload_to=functools.partial(opencontractserver.shared.utils.calc_oc_file_path, *(), **{'sub_folder': 'pdf_files'}))),
                ('import_log', models.TextField(blank=True, null=True)),
                ('analysis_started', models.DateTimeField(blank=True, null=True)),
                ('analysis_completed', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[(opencontractserver.types.enums.JobStatus['CREATED'],
                                                      opencontractserver.types.enums.JobStatus['CREATED']),
                                                     (opencontractserver.types.enums.JobStatus['QUEUED'],
                                                      opencontractserver.types.enums.JobStatus['QUEUED']),
                                                     (opencontractserver.types.enums.JobStatus['RUNNING'],
                                                      opencontractserver.types.enums.JobStatus['RUNNING']),
                                                     (opencontractserver.types.enums.JobStatus['COMPLETED'],
                                                      opencontractserver.types.enums.JobStatus['COMPLETED']),
                                                     (opencontractserver.types.enums.JobStatus['FAILED'],
                                                      opencontractserver.types.enums.JobStatus['FAILED'])],
                                            default='CREATED', max_length=24)),
            ],
            options={
                'permissions': (('create_analysis', 'create Analysis'), ('read_analysis', 'read Analysis'), ('update_analysis', 'update Analysis'), ('remove_analysis', 'delete Analysis'), ('publish_analysis', 'publish Analysis'), ('permission_analysis', 'permission Analysis')),
            },
        ),
        migrations.CreateModel(
            name='AnalysisGroupObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='AnalysisUserObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Analyzer',
            fields=[
                ('backend_lock', models.BooleanField(default=False)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('id', models.CharField(max_length=1024, primary_key=True, serialize=False)),
                ('manifest', opencontractserver.shared.fields.NullableJSONField(blank=True, default=opencontractserver.shared.defaults.jsonfield_default_value, null=True)),
                ('description', models.TextField(blank=True, default='')),
                ('disabled', models.BooleanField(default=False)),
                ('is_public', models.BooleanField(default=True)),
                ('icon', models.FileField(blank=True, upload_to=opencontractserver.analyzer.models.calculate_analyzer_icon_path)),
            ],
            options={
                'permissions': (('permission_analyzer', 'permission analyzer'), ('publish_analyzer', 'publish analyzer'), ('create_analyzer', 'create analyzer'), ('read_analyzer', 'read analyzer'), ('update_analyzer', 'update analyzer'), ('remove_analyzer', 'delete analyzer')),
            },
        ),
        migrations.CreateModel(
            name='AnalyzerGroupObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='AnalyzerUserObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='GremlinEngine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('backend_lock', models.BooleanField(default=False)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('url', models.CharField(max_length=1024)),
                ('api_key', models.CharField(blank=True, max_length=1024, null=True)),
                ('last_synced', models.DateTimeField(blank=True, null=True, verbose_name='Creation Date and Time')),
                ('install_started', models.DateTimeField(blank=True, null=True, verbose_name='Install Started')),
                ('install_completed', models.DateTimeField(blank=True, null=True, verbose_name='Install Completed')),
                ('is_public', models.BooleanField(default=True)),
            ],
            options={
                'permissions': (('permission_gremlinengine', 'permission gremlin engine'), ('publish_gremlinengine', 'publish gremlin engine'), ('create_gremlinengine', 'create gremlin engine'), ('read_gremlinengine', 'read gremlin engine'), ('update_gremlinengine', 'update gremlin engine'), ('remove_gremlinengine', 'delete gremlin engine')),
            },
        ),
        migrations.CreateModel(
            name='GremlinEngineGroupObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='GremlinEngineUserObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_object', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='analyzer.gremlinengine')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.permission')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
