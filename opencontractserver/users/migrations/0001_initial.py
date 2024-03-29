# Generated by Django 3.2.9 on 2022-10-15 21:40

from django.conf import settings
import django.contrib.auth.models
import django.contrib.auth.validators
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import opencontractserver.users.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('corpuses', '0001_initial'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('annotations', '0001_initial'),
        ('documents', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('name', models.CharField(blank=True, max_length=255, verbose_name='Name of User')),
                ('first_name', models.CharField(blank=True, max_length=255, verbose_name='First Name')),
                ('last_name', models.CharField(blank=True, max_length=255, verbose_name='First Name')),
                ('given_name', models.CharField(blank=True, max_length=255, verbose_name='First Name')),
                ('family_name', models.CharField(blank=True, max_length=255, verbose_name='Last Name')),
                ('auth0_Id', models.CharField(blank=True, max_length=255, verbose_name='Auth0 User ID')),
                ('phone', models.CharField(blank=True, max_length=255, verbose_name='Phone Number')),
                ('email', models.CharField(blank=True, max_length=255, verbose_name='Email Address')),
                ('synced', models.BooleanField(default=False, verbose_name='Synced Remote User Data')),
                ('is_active', models.BooleanField(default=True, verbose_name='Disabled Account')),
                ('email_verified', models.BooleanField(default=False, verbose_name='Is email verified?')),
                ('is_social_user', models.BooleanField(default=False, verbose_name='Social Sign-up')),
                ('is_usage_capped', models.BooleanField(default=True, verbose_name='Usage Capped?')),
                ('last_synced', models.DateTimeField(blank=True, null=True, verbose_name='Last Sync with Remote User Data')),
                ('first_signed_in', models.DateTimeField(default=django.utils.timezone.now, verbose_name='First login')),
                ('last_ip', models.CharField(blank=True, max_length=255, verbose_name='Last IP Address')),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.Group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.Permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'user',
                'verbose_name_plural': 'users',
                'abstract': False,
            },
            managers=[
                ('objects', django.contrib.auth.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Assignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(blank=True, max_length=1024, null=True)),
                ('comments', models.TextField(default='')),
                ('completed_at', models.DateTimeField(blank=True, default=None, null=True, verbose_name='Creation Date and Time')),
                ('created', models.DateTimeField(default=django.utils.timezone.now, verbose_name='Creation Date and Time')),
                ('modified', models.DateTimeField(blank=True, default=django.utils.timezone.now)),
                ('assignee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='my_assignments', related_query_name='my_assignment', to=settings.AUTH_USER_MODEL)),
                ('assignor', models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, related_name='created_assignments', related_query_name='created_assignment', to=settings.AUTH_USER_MODEL)),
                ('corpus', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, to='corpuses.corpus')),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='documents.document')),
                ('resulting_annotations', models.ManyToManyField(blank=True, to='annotations.Annotation')),
                ('resulting_relationships', models.ManyToManyField(blank=True, to='annotations.Relationship')),
            ],
            options={
                'permissions': (('permission_assignment', 'permission assignment'), ('publish_assignment', 'publish assignment'), ('create_assignment', 'create assignment'), ('read_assignment', 'read assignment'), ('update_assignment', 'update assignment'), ('remove_assignment', 'delete assignment')),
            },
        ),
        migrations.CreateModel(
            name='Auth0APIToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.TextField(verbose_name='Auth0 Token')),
                ('expiration_Date', models.DateTimeField(verbose_name='Token Expiration Date:')),
                ('refreshing', models.BooleanField(default=False, verbose_name='Refreshing Token')),
                ('auth0_Response', models.TextField(verbose_name='Last Response from Auth0')),
            ],
        ),
        migrations.CreateModel(
            name='UserImport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('zip', models.FileField(blank=True, upload_to=opencontractserver.users.models.calculate_import_filename)),
                ('name', models.CharField(blank=True, max_length=1024, null=True)),
                ('created', models.DateTimeField(default=django.utils.timezone.now)),
                ('started', models.DateTimeField(null=True)),
                ('finished', models.DateTimeField(null=True)),
                ('errors', models.TextField(blank=True)),
                ('is_public', models.BooleanField(default=False)),
                ('creator', models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'permissions': (('permission_userimport', 'permission user import'), ('publish_userimport', 'publish user import'), ('create_userimport', 'create user import'), ('read_userimport', 'read user import'), ('update_userimport', 'update user import'), ('remove_userimport', 'delete user import')),
            },
        ),
        migrations.CreateModel(
            name='UserExport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('zip', models.FileField(blank=True, upload_to=opencontractserver.users.models.calculate_export_filename)),
                ('name', models.CharField(blank=True, max_length=1024, null=True)),
                ('created', models.DateTimeField(default=django.utils.timezone.now)),
                ('started', models.DateTimeField(null=True)),
                ('finished', models.DateTimeField(null=True)),
                ('errors', models.TextField(blank=True)),
                ('backend_lock', models.BooleanField(default=False)),
                ('is_public', models.BooleanField(default=False)),
                ('creator', models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'permissions': (('permission_userexport', 'permission user export'), ('publish_userexport', 'publish user export'), ('create_userexport', 'create user export'), ('read_userexport', 'read user export'), ('update_userexport', 'update user export'), ('remove_userexport', 'delete user export')),
            },
        ),
        migrations.CreateModel(
            name='AssignmentUserObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_object', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='users.assignment')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.permission')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
                'unique_together': {('user', 'permission', 'content_object')},
            },
        ),
        migrations.CreateModel(
            name='AssignmentGroupObjectPermission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_object', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='users.assignment')),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.group')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.permission')),
            ],
            options={
                'abstract': False,
                'unique_together': {('group', 'permission', 'content_object')},
            },
        ),
    ]
