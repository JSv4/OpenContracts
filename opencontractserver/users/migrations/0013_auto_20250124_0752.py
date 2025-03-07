from django.contrib.auth.models import Group, Permission
from django.core.management.sql import emit_post_migrate_signal
from django.conf import settings
import logging

from django.db import migrations

logger = logging.getLogger(__name__)

public_group_permissions = {
    settings.DEFAULT_PERMISSIONS_GROUP: [
        "create_conversation",
        "read_conversation", 
        "update_conversation",
        "delete_conversation",
        "permission_conversation",
        
        "create_chatmessage",
        "read_chatmessage",
        "update_chatmessage", 
        "delete_chatmessage",
        "permission_chatmessage",
    ]
}


def add_group_permissions(apps, schema_editor):
    # See https://code.djangoproject.com/ticket/23422
    db_alias = schema_editor.connection.alias

    try:
        emit_post_migrate_signal(2, False, 'default')
    except TypeError:  # Django < 1.8
        emit_post_migrate_signal([], 2, False, 'default', db_alias)

    for group in public_group_permissions:
        role, created = Group.objects.get_or_create(name=group)
        logger.info(f'{group} Group created: {created}')
        for perm in public_group_permissions[group]:
            logger.info(f'Permitting {group} to {perm}')
            role.permissions.add(Permission.objects.get(codename=perm))
        role.save()

    logger.info(f"Installation of default public access group {settings.DEFAULT_PERMISSIONS_GROUP} COMPLETE!")

class Migration(migrations.Migration):
    dependencies = [
        ("users", "0012_userexport_input_kwargs_userexport_post_processors"),
    ]

    operations = [
        migrations.RunPython(add_group_permissions),
    ]
