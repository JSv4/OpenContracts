# Generated by Django 3.2.9 on 2022-10-15 21:40

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('corpuses', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('documents', '0001_initial'),
        ('annotations', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='corpususerobjectpermission',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='corpusgroupobjectpermission',
            name='content_object',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='corpuses.corpus'),
        ),
        migrations.AddField(
            model_name='corpusgroupobjectpermission',
            name='group',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.group'),
        ),
        migrations.AddField(
            model_name='corpusgroupobjectpermission',
            name='permission',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='auth.permission'),
        ),
        migrations.AddField(
            model_name='corpus',
            name='creator',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='corpus',
            name='documents',
            field=models.ManyToManyField(blank=True, to='documents.Document'),
        ),
        migrations.AddField(
            model_name='corpus',
            name='label_set',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='used_by_corpuses', related_query_name='used_by_corpus', to='annotations.labelset'),
        ),
        migrations.AddField(
            model_name='corpus',
            name='parent',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='corpuses.corpus', verbose_name='parent'),
        ),
        migrations.AddField(
            model_name='corpus',
            name='user_lock',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='editing_corpuses', related_query_name='editing_corpus', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterUniqueTogether(
            name='corpususerobjectpermission',
            unique_together={('user', 'permission', 'content_object')},
        ),
        migrations.AlterUniqueTogether(
            name='corpusgroupobjectpermission',
            unique_together={('group', 'permission', 'content_object')},
        ),
    ]
