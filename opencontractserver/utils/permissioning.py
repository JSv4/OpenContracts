from __future__ import annotations

import logging

import django
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.db.models import Q
from guardian.shortcuts import assign_perm

from opencontractserver.types.enums import PermissionTypes

User = get_user_model()
logger = logging.getLogger(__name__)


def resolve_user(user: User | int | str) -> User:
    """Resolve a user given an int (id), a string (username or numeric id), or a User instance.
    If the provided user is anonymous, return it immediately.
    """
    logger = logging.getLogger(__name__)

    # Special case: if the user is already an AnonymousUser, return it.
    if hasattr(user, "is_anonymous") and user.is_anonymous:
        logger.debug("RESOLVE_USER: AnonymousUser provided; returning as is")
        return user

    try:
        if isinstance(user, str) and user.isdigit():
            logger.debug(f"RESOLVE_USER: Resolving numeric string '{user}' as user ID")
            resolved_user = User.objects.get(id=int(user))
            logger.info(
                f"RESOLVE_USER: Successfully resolved user ID {user} to user {resolved_user.username}"
            )
            return resolved_user
        elif isinstance(user, str):
            logger.debug(f"RESOLVE_USER: Resolving string '{user}' as username")
            resolved_user = User.objects.get(username=user)
            logger.info(
                f"RESOLVE_USER: Successfully resolved username '{user}' to user ID {resolved_user.id}"
            )
            return resolved_user
        elif isinstance(user, int):
            logger.debug(f"RESOLVE_USER: Resolving int {user} as user ID")
            resolved_user = User.objects.get(id=user)
            logger.info(
                f"RESOLVE_USER: Successfully resolved user ID {user} to user {resolved_user.username}"
            )
            return resolved_user
        elif hasattr(user, "id"):
            logger.debug(
                f"RESOLVE_USER: User object already provided (ID: {user.id}, username: {user.username})"
            )
            return user
        else:
            logger.error(f"RESOLVE_USER: Invalid user argument type: {type(user)}")
            raise ValueError(
                f"Invalid user argument type: {type(user)}, expected int, str, or User object"
            )
    except User.DoesNotExist as e:
        logger.error(f"RESOLVE_USER: User not found: {str(e)}")
        raise


def filter_queryset_by_permission(queryset, user, permission: str = "read"):
    """
    Returns a queryset filtered so that only objects the given user is allowed to
    access under a given permission are included.

    Criteria:
      1. Superusers see all objects.
      2. Anonymous users see only objects with is_public == True.
      3. Authenticated users:
         - For "read" permission:
              * See objects that are public OR that they created,
                OR for which they have an explicit Guardian permission (e.g. "read_<model>").
              * Additionally, if the object is linked to a corpus (or corpus_set)
                and the corpus is visible to the user, include the object.
         - For non-"read" permissions:
              * Only see objects that they created OR for which they have an explicit
                Guardian permission (e.g. "update_<model>" or "delete_<model>").
              * (Note: is_public and corpus fallback do not automatically grant non-read permissions.)
    """
    import logging

    from opencontractserver.corpuses.models import Corpus

    logger = logging.getLogger(__name__)
    model_name = queryset.model._meta.model_name
    logger.info(
        f"Filtering {model_name} queryset for user {user} with permission: {permission}"
    )

    # Superuser: no filtering.
    if user.is_superuser:
        logger.info("User is superuser - returning all objects")
        return queryset.all()

    # Anonymous: only public objects (read permission only).
    if user.is_anonymous:
        logger.info("User is anonymous - returning only public objects")
        return queryset.filter(is_public=True).distinct()

    # For authenticated users:
    # For "read", include public objects; for non-read, do not.
    if permission.lower() == "read":
        base_q = Q(is_public=True) | Q(creator=user)
    else:
        base_q = Q(creator=user)

    logger.info(f"Base query: {base_q}")

    # Construct guardian query.
    permission_codename = f"{permission.lower()}_{model_name}"
    logger.info(f"Looking for Guardian permission: {permission_codename}")
    guardian_q = Q(
        **{
            f"{model_name}userobjectpermission__permission__codename": permission_codename,
            f"{model_name}userobjectpermission__user": user,
        }
    )

    qs = queryset.filter(base_q | guardian_q)
    logger.info(f"After base and guardian filtering: {qs.count()} objects")

    # Add corpus fallback.
    if hasattr(queryset.model, "corpus"):
        logger.info("Model has 'corpus' relation - checking corpus visibility")
        visible_corpora = Corpus.objects.visible_to_user(user)
        corpus_qs = queryset.filter(
            Q(corpus__isnull=False) & Q(corpus__in=visible_corpora)
        )
        logger.info(f"Corpus fallback added {corpus_qs.count()} objects")
        qs = qs | corpus_qs

    final_qs = qs.distinct()
    logger.info(f"Final filtered queryset has {final_qs.count()} objects")
    return final_qs


def user_has_permission_for_obj(
    user_val: int | str | User,
    instance: models.Model,
    permission: PermissionTypes,
    include_group_permissions: bool = True,  # currently not used separately
) -> bool:
    """
    Check if a user has the given permission on an object.

    This function reuses the central permission filtering logic by constructing
    a queryset for the instance and filtering it using filter_queryset_by_permission.

    Args:
        user_val: A User instance, an int (ID) or a str (ID or username).
        instance: The Django model instance to check.
        permission: The permission to check (from PermissionTypes).
        include_group_permissions: (Not separately used here since the helper already includes group permissions)

    Returns:
        True if the object is visible under the given permission; False otherwise.
    """
    user = resolve_user(user_val)

    # Build a queryset for the instance (filter by primary key).
    qs = instance.__class__.objects.filter(pk=instance.pk)

    # Use the helper. Note: our helper expects a string permission.
    # If your PermissionTypes enum is all uppercase (e.g. "READ"), we convert it to lowercase.
    perm_str = permission.value.lower()

    visible_qs = filter_queryset_by_permission(qs, user, perm_str)
    result = visible_qs.exists()

    return result


def set_permissions_for_obj_to_user(
    user_val: int | str | User,
    instance: django.db.models.Model,
    permissions: PermissionTypes | list[PermissionTypes],
) -> None:
    """
    Given a Django model instance, a user (or user id), and either a single or a list of desired
    permissions, REPLACE current object-level permissions with the specified ones.
    Special Cases:
      - CRUD assigns: create, read, update, delete.
      - ALL assigns: create, read, update, delete, permission, publish.
    """
    # Normalize to list.
    if not isinstance(permissions, list):
        permissions = [permissions]

    # Retrieve user instance if necessary.
    if isinstance(user_val, (str, int)):
        user = User.objects.get(id=user_val)
    else:
        user = user_val

    model_name = instance._meta.model_name
    app_name = instance._meta.app_label

    # Remove existing object-level permissions.
    with transaction.atomic():
        existing_permissions = getattr(
            instance, f"{model_name}userobjectpermission_set"
        )
        existing_permissions.all().delete()

    # Map enum to underlying permission actions.
    permission_mapping: dict[PermissionTypes, set[str]] = {
        PermissionTypes.CREATE: {"create"},
        PermissionTypes.READ: {"read"},
        PermissionTypes.UPDATE: {"update"},
        PermissionTypes.EDIT: {"update"},
        PermissionTypes.DELETE: {"delete"},
        PermissionTypes.PERMISSION: {"permission"},
        PermissionTypes.PUBLISH: {"publish"},
        PermissionTypes.CRUD: {"create", "read", "update", "delete"},
        PermissionTypes.ALL: {
            "create",
            "read",
            "update",
            "delete",
            "permission",
            "publish",
        },
    }

    actions_to_assign: set[str] = set()
    for perm in permissions:
        actions = permission_mapping.get(perm)
        if actions:
            actions_to_assign.update(actions)

    with transaction.atomic():
        for action in actions_to_assign:
            codename = f"{app_name}.{action}_{model_name}"
            assign_perm(codename, user, instance)


def generate_permissions_md_table_for_object(
    users: list[User], instance: models.Model
) -> str:
    """
    Generate a Markdown table summarizing the effective permissions on a given object for each user.

    For each user in the list, the following permission types are evaluated:
      - CREATE
      - READ
      - UPDATE (EDIT is considered equivalent to UPDATE)
      - DELETE
      - PERMISSION
      - PUBLISH
      - CRUD (implying create, read, update, delete)
      - ALL (all available permissions)

    The permission evaluation uses the unified permission logic via
    `user_has_permission_for_obj()`. In our design:
      - Superusers are assumed to have all permissions.
      - Anonymous users see only public objects (i.e. typically only READ permission).
      - Authenticated users are granted permissions if they are the creator,
        if the object is public, if explicit guardian permissions exist, or if a linked corpus
        is visible per our fallback logic.

    Args:
        users: A list of User objects to check.
        instance: The Django model instance for which to check permissions.

    Returns:
        A Markdown-formatted string containing a table with one row per user and columns
        for each permission type.

    Example output:

    | Username | CREATE | READ | UPDATE | DELETE | PERMISSION | PUBLISH | CRUD | ALL |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | alice | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
    | bob | No | Yes | No | No | No | No | No | No |
    """
    # Define the permission types (order matters)
    permission_types = [
        PermissionTypes.CREATE,
        PermissionTypes.READ,
        PermissionTypes.UPDATE,  # EDIT is treated as UPDATE
        PermissionTypes.DELETE,
        PermissionTypes.PERMISSION,
        PermissionTypes.PUBLISH,
        PermissionTypes.CRUD,
        PermissionTypes.ALL,
    ]

    # Build table header.
    headers = ["Username"] + [perm.value for perm in permission_types]
    md_lines = []
    md_lines.append("| " + " | ".join(headers) + " |")
    md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

    # For each user, evaluate each permission.
    for user in users:
        username = getattr(user, "username", str(user))
        row = [username]
        for perm in permission_types:
            has_perm = user_has_permission_for_obj(
                user, instance, perm, include_group_permissions=True
            )
            row.append("Yes" if has_perm else "No")
        md_lines.append("| " + " | ".join(row) + " |")

    return "\n".join(md_lines)
