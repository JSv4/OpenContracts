from django.contrib.auth.models import Group, Permission
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
    for group in public_group_permissions:
        role, created = Group.objects.get_or_create(name=group)
        logger.info(f'{group} Group created: {created}')
        for perm in public_group_permissions[group]:
            try:
                logger.info(f'Permitting {group} to {perm}')
                role.permissions.add(Permission.objects.get(codename=perm))
            except Permission.DoesNotExist:
                logger.warning(f"Permission '{perm}' does not exist yet; skipping assignment.")
        role.save()

    logger.info(f"Installation of default public access group {settings.DEFAULT_PERMISSIONS_GROUP} COMPLETE!")

class Migration(migrations.Migration):
    dependencies = [
        ("users", "0012_userexport_input_kwargs_userexport_post_processors"),
    ]

    operations = [
        migrations.RunPython(add_group_permissions),
    ]
