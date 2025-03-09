from __future__ import annotations

import logging

import django
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db import models, transaction
from guardian.models import GroupObjectPermission, UserObjectPermission
from guardian.shortcuts import assign_perm

from opencontractserver.types.enums import PermissionTypes

User = get_user_model()
logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
#                             HELPER FUNCTIONS
# -------------------------------------------------------------------------


def _get_permission_mapping() -> dict[PermissionTypes, set[str]]:
    """
    Private helper that returns the expansions for our special permission enums,
    i.e. CRUD => create, read, update, delete and ALL => create, read, update, delete, permission, publish.
    Used by both set_permissions_for_obj_to_user and filter_queryset_by_permission to maintain consistency.
    """
    logger.debug("_get_permission_mapping called")
    mapping = {
        PermissionTypes.CRUD: {"CREATE", "READ", "UPDATE", "DELETE"},
        PermissionTypes.ALL: {
            "CREATE",
            "READ",
            "UPDATE",
            "DELETE",
            "PERMISSION",
            "PUBLISH",
        },
    }
    logger.debug(f"Permission mapping: {mapping}")

    # Log all available PermissionTypes for comparison
    all_permission_types = [pt for pt in PermissionTypes]
    logger.debug(f"All available PermissionTypes: {all_permission_types}")

    return mapping


def _get_db_codename_for_action(action: str, model_name: str) -> str:
    """
    Convert an action string (e.g., "delete") to the actual database codename (e.g., "remove_corpus").
    This centralizes our permission naming conventions to avoid mismatches.
    """
    logger.debug(
        f"_get_db_codename_for_action called with action: {action}, model_name: {model_name}"
    )
    action_lower = action.lower()

    # Special case: Django models.Meta uses "remove_corpus" for the delete permission
    if action_lower == "delete":
        logger.debug("Converting 'delete' to 'remove' for Django compatibility")
        action_lower = "remove"

    codename = f"{action_lower}_{model_name}"
    logger.debug(f"Generated codename: {codename}")
    return codename


def _get_actions_for_permissions(
    permissions: PermissionTypes | list[PermissionTypes],
) -> set[str]:
    """
    Given a permission or list of permissions from PermissionTypes, returns
    the combined set of actions (strings) they represent.
    """
    # Normalize to a list.
    if not isinstance(permissions, list):
        permissions = [permissions]

    permission_mapping = _get_permission_mapping()
    actions_to_assign: set[str] = set()
    for perm in permissions:
        # For special permission types, use the mapping
        if perm in permission_mapping:
            actions = permission_mapping[perm]
        # For basic permission types, use the permission value directly
        else:
            actions = {perm.value}
        actions_to_assign.update(actions)
    return actions_to_assign


def _clear_object_level_perms(instance: models.Model) -> None:
    """
    Removes all existing object-level permissions for the given instance,
    regardless of user or group.
    """
    logger.debug(
        f"_clear_object_level_perms called for {instance._meta.model_name} {instance.pk}"
    )

    model_name = instance._meta.model_name

    # Log existing permissions before clearing
    from guardian.shortcuts import get_users_with_perms

    users_with_perms = get_users_with_perms(instance, attach_perms=True)
    logger.debug(f"Users with permissions before clearing: {users_with_perms}")

    existing_permissions = getattr(instance, f"{model_name}userobjectpermission_set")
    perm_count = existing_permissions.count()
    logger.debug(f"Found {perm_count} user object permissions to clear")
    existing_permissions.all().delete()
    logger.debug(f"Cleared {perm_count} user object permissions")

    group_permissions = getattr(
        instance, f"{model_name}groupobjectpermission_set", None
    )
    if group_permissions:
        group_perm_count = group_permissions.count()
        logger.debug(f"Found {group_perm_count} group object permissions to clear")
        group_permissions.all().delete()
        logger.debug(f"Cleared {group_perm_count} group object permissions")
    else:
        logger.debug(f"No group permissions attribute found for {model_name}")

    # Log permissions after clearing
    users_with_perms_after = get_users_with_perms(instance, attach_perms=True)
    logger.debug(f"Users with permissions after clearing: {users_with_perms_after}")


def _assign_actions_to_user_for_obj(
    user: User, instance: models.Model, actions: set[str]
) -> None:
    """
    Assign each action in 'actions' (e.g. "read", "update") to the user
    for the given instance, using django-guardian's assign_perm.
    """
    from django.contrib.auth.models import Permission
    from django.core.exceptions import ObjectDoesNotExist

    logger.debug(
        f"_assign_actions_to_user_for_obj called for user {user.username} with actions: {actions}"
    )

    model_name = instance._meta.model_name
    app_name = instance._meta.app_label

    logger.debug(f"Model name: {model_name}, App name: {app_name}")

    for action in actions:
        # Use the centralized helper to get the correct codename
        perm_codename = _get_db_codename_for_action(action, model_name)
        logger.debug(
            f"Converting action '{action}' to permission codename: '{perm_codename}'"
        )

        try:
            # Guardian expects the full permission string with app_label
            full_perm = f"{app_name}.{perm_codename}"
            logger.debug(
                f"Assigning permission '{full_perm}' to user {user.username} for {model_name} {instance.pk}"
            )
            assign_perm(full_perm, user, instance)
            logger.debug(
                f"Successfully assigned permission '{full_perm}' to user {user.username}"
            )
        except (Permission.DoesNotExist, ObjectDoesNotExist) as exc:
            logger.warning(
                f"Permission '{perm_codename}' does not exist for '{model_name}'; skipping assignment. "
                f"Error: {exc}"
            )

    # Log all permissions after assignment
    from guardian.shortcuts import get_perms

    assigned_perms = get_perms(user, instance)
    logger.debug(
        f"After assignment, user {user.username} has permissions on {model_name} {instance.pk}: {assigned_perms}"
    )


def resolve_user(user: User | int | str) -> User:
    """Resolve a user given an int (id), a string (username or numeric id), or a User instance.
    If the provided user is anonymous, return it immediately.
    """
    logger = logging.getLogger(__name__)
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


def filter_queryset_by_permission(
    queryset: models.QuerySet,
    user: User | AnonymousUser,
    permission: str | PermissionTypes = "read",
) -> models.QuerySet:
    """
    Returns a queryset filtered so that only objects the given user is allowed to
    access under a given permission are included.

    BIG-PICTURE CRITERIA:
      1. Superusers see all objects.
      2. Anonymous users see only objects with is_public==True.
      3. Authenticated users:
         - For "read" permission:
             * See objects that are public OR they created,
               OR for which they have an explicit Guardian permission (e.g. "read_<model>").
             * If model.INHERITS_CORPUS_PERMISSIONS is True, and the user has the *same* permission on the corpus,
               they inherit that permission on the child.
         - For non-"read" permissions:
             * See objects they created OR for which they have explicit Guardian permission (e.g. "update_<model>").
             * If model.INHERITS_CORPUS_PERMISSIONS is True, and the user has the *same* permission on the corpus,
               they inherit that permission on the child as well.
         - Special permission types:
             * CRUD => union of create, read, update, delete
             * ALL => union of create, read, update, delete, permission, publish
    """

    from django.db.models import Q

    model_name = queryset.model._meta.model_name
    logger.info(
        f"Filtering {model_name} queryset for user {user} with permission: {permission}"
    )

    # If permission is a string, convert it to lowercase
    if isinstance(permission, str):
        permission = permission.lower()
    else:
        # If it's an enum, get its lowercase string value
        permission = permission.value.lower()

    # Superuser => all
    if getattr(user, "is_superuser", False):
        logger.info("User is superuser - returning all objects")
        return queryset.all()

    # Anonymous => only public
    if getattr(user, "is_anonymous", False):
        logger.info("User is anonymous - returning only public objects")
        # No need to worry about corpus fallback for anonymous:
        # they only get is_public anyway unless explicitly handled in code for anonymous.
        return queryset.filter(is_public=True).distinct()

    # Authenticated logic:

    # Base query depends on read vs. other (e.g. update/delete)
    if permission == "read":
        base_q = Q(is_public=True) | Q(creator=user)
    else:
        base_q = Q(creator=user)

    logger.info(f"Base query: {base_q}")

    # Get the correct permission codename using our centralized helper
    permission_codename = _get_db_codename_for_action(permission, model_name)

    logger.info(f"Looking for Guardian permission: {permission_codename}")
    guardian_q = Q(
        **{
            f"{model_name}userobjectpermission__permission__codename": permission_codename,
            f"{model_name}userobjectpermission__user": user,
        }
    )

    qs = queryset.filter(base_q | guardian_q)
    logger.info(f"After base and guardian filtering: {qs.count()} objects")

    # If the model says to inherit corpus permissions, then union with all objects
    # whose corpus** is visible under the *same* permission.
    inherits_permissions = hasattr(
        queryset.model, "INHERITS_CORPUS_PERMISSIONS"
    ) and getattr(queryset.model, "INHERITS_CORPUS_PERMISSIONS", False)
    if inherits_permissions and hasattr(queryset.model, "corpus"):
        logger.info(
            "Model has 'corpus' relation and inherits corpus permissions - checking corpus-level perms"
        )
        qs = _add_corpus_fallback(qs, user, permission)

    final_qs = qs.distinct()
    logger.info(f"Final filtered queryset has {final_qs.count()} objects")
    return final_qs


def _add_corpus_fallback(
    child_queryset: models.QuerySet,
    user: User,
    permission: str,
) -> models.QuerySet:
    """
    Return child_queryset unioned with any objects whose corpus is permitted to the user
    under the *same* 'permission'.

    1) Build a set of corpus PKs the user can access under `permission`.
    2) Return union of the existing child_queryset plus the objects whose corpus__in=that set.
    """

    from django.db.models import Q

    from opencontractserver.corpuses.models import Corpus

    # If user is superuser, all corpora are permitted
    if user.is_superuser:
        permitted_corpus_ids = Corpus.objects.values_list("pk", flat=True)
    # If user is anonymous, no fallback
    elif user.is_anonymous:
        # Normally anonymous users only get is_public anyway.
        # We won't union anything here.
        return child_queryset
    else:
        # Build a base corpus Q
        if permission.lower() == "read":
            # read => public or own or guardian read
            corpus_base_q = Q(is_public=True) | Q(creator=user)
        else:
            corpus_base_q = Q(creator=user)

        corpus_codename = f"{permission.lower()}_corpus"
        guardian_corpus_q = Q(
            **{
                "corpususerobjectpermission__permission__codename": corpus_codename,
                "corpususerobjectpermission__user": user,
            }
        )

        permitted_corpora = Corpus.objects.filter(corpus_base_q | guardian_corpus_q)
        permitted_corpora = permitted_corpora.distinct()

        # If that set is non-empty, union them
        permitted_corpus_ids = permitted_corpora.values_list("pk", flat=True)

    fallback_qs = child_queryset.model.objects.filter(
        Q(corpus__isnull=False) & Q(corpus__in=permitted_corpus_ids)
    )
    logger.info(f"Corpus fallback added {fallback_qs.count()} objects")

    return (child_queryset | fallback_qs).distinct()


def user_has_permission_for_obj(
    user_val: int | str | User,
    instance: models.Model,
    permission: PermissionTypes,
    include_group_permissions: bool = True,  # currently not used separately
) -> bool:
    """
    Check if a user has the given permission on an object.
    """
    user = resolve_user(user_val)

    # Special handling for ALL and CRUD
    if permission in [PermissionTypes.ALL, PermissionTypes.CRUD]:
        # Get the component permissions
        permission_mapping = _get_permission_mapping()
        component_permissions = permission_mapping.get(permission, set())

        # Check if the user has all the component permissions
        for component in component_permissions:
            component_enum = getattr(PermissionTypes, component)
            if not user_has_permission_for_obj(user, instance, component_enum):
                return False
        return True

    # Regular permission check
    qs = instance.__class__.objects.filter(pk=instance.pk)
    perm_str = permission.value.lower()
    visible_qs = filter_queryset_by_permission(qs, user, perm_str)
    return visible_qs.exists()


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
    # Resolve user
    user = resolve_user(user_val)
    logger.debug(
        f"set_permissions_for_obj_to_user called for user {user.username} on {instance._meta.model_name} {instance.pk}"
    )
    logger.debug(f"Permissions to set: {permissions}")

    # Remove existing object-level permissions for everyone (not just this user).
    logger.debug(
        f"Clearing existing object-level permissions for {instance._meta.model_name} {instance.pk}"
    )
    with transaction.atomic():
        _clear_object_level_perms(instance)

    # Convert the user-specified PermissionTypes into underlying actions
    logger.debug("Converting permission types to actions")
    actions_to_assign = _get_actions_for_permissions(permissions)
    logger.debug(f"Actions to assign: {actions_to_assign}")

    # Now assign them to the user
    logger.debug(f"Assigning actions to user {user.username}")
    with transaction.atomic():
        _assign_actions_to_user_for_obj(user, instance, actions_to_assign)

    # Log the final permissions
    from guardian.shortcuts import get_perms

    final_perms = get_perms(user, instance)
    logger.debug(
        f"Final permissions for user {user.username} on {instance._meta.model_name} {instance.pk}: {final_perms}"
    )

    # Also log the permissions from our custom function
    custom_perms = get_users_permissions_for_obj(user, instance)
    logger.debug(f"Custom get_users_permissions_for_obj result: {custom_perms}")


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
    permission_types = [
        PermissionTypes.CREATE,
        PermissionTypes.READ,
        PermissionTypes.UPDATE,
        PermissionTypes.DELETE,
        PermissionTypes.PERMISSION,
        PermissionTypes.PUBLISH,
        PermissionTypes.CRUD,
        PermissionTypes.ALL,
    ]

    headers = ["Username"] + [perm.value for perm in permission_types]
    md_lines = []
    md_lines.append("| " + " | ".join(headers) + " |")
    md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

    for user_obj in users:
        username = getattr(user_obj, "username", str(user_obj))
        row = [username]
        for perm in permission_types:
            has_perm = user_has_permission_for_obj(
                user_obj, instance, perm, include_group_permissions=True
            )
            row.append("Yes" if has_perm else "No")
        md_lines.append("| " + " | ".join(row) + " |")

    return "\n".join(md_lines)


def get_users_permissions_for_obj(
    user_val: User | int | str,
    instance: models.Model,
    include_group_permissions: bool = False,
) -> set[str]:
    """
    Return a set of effective permission codenames for the given user on the provided model instance.

    This function performs a SINGLE pass at collecting all relevant object-level codenames
    rather than calling user_has_permission_for_obj() repeatedly. By doing so, it is more
    performant for scenarios where you need to know every permission the user has at once.

    -------------
    LOGIC SUMMARY:
      1) If user is superuser: return all codenames for 'create', 'read', 'update', 'delete',
         'permission', and 'publish'.
      2) If user is AnonymousUser: only add "read_<model>" if:
         - The instance is marked is_public=True, OR
         - The corpus fallback is relevant and that corpus is public.
      3) For authenticated users:
         - If user == instance.creator, add CRUD automatically.
         - If instance is public, add "read_<model>".
         - If the object is linked to a corpus that is visible, add "read_<model>".
         - Then add any object-level guardian permissions from userobjectpermission
           and (optionally) groupobjectpermission.
    """
    from opencontractserver.corpuses.models import Corpus

    user = resolve_user(user_val)
    logger.debug(
        f"get_users_permissions_for_obj called for user {user.username} on {instance._meta.model_name} {instance.pk}"
    )

    model_name = instance._meta.model_name
    app_label = instance._meta.app_label
    logger.debug(f"Model name: {model_name}, App label: {app_label}")

    final_codenames: set[str] = set()

    # 1) SUPERUSER => all codenames
    if getattr(user, "is_superuser", False):
        logger.debug(f"User {user.username} is superuser - granting all permissions")
        for action in ["create", "read", "update", "delete", "permission", "publish"]:
            final_codenames.add(_get_db_codename_for_action(action, model_name))
        logger.debug(f"Final codenames for superuser: {final_codenames}")
        return final_codenames

    # 2) ANONYMOUS => read only if public or corpus fallback
    if isinstance(user, AnonymousUser):
        logger.debug("User is anonymous")
        if getattr(instance, "is_public", False):
            logger.debug("Instance is public - granting read permission")
            final_codenames.add(_get_db_codename_for_action("read", model_name))
        else:
            # corpus fallback
            logger.debug("Instance is not public - checking corpus fallback")
            if hasattr(instance, "corpus") and instance.corpus:
                logger.debug(f"Instance has corpus attribute: {instance.corpus}")
                if Corpus.objects.filter(
                    pk=instance.corpus.pk, is_public=True
                ).exists():
                    logger.debug("Corpus is public - granting read permission")
                    final_codenames.add(_get_db_codename_for_action("read", model_name))
            elif hasattr(instance, "corpus_set"):
                logger.debug("Instance has corpus_set attribute")
                if instance.corpus_set.filter(is_public=True).exists():
                    logger.debug(
                        "Corpus set contains public corpus - granting read permission"
                    )
                    final_codenames.add(_get_db_codename_for_action("read", model_name))
        logger.debug(f"Final codenames for anonymous user: {final_codenames}")
        return final_codenames

    # 3) AUTHENTICATED USERS
    logger.debug(f"Processing authenticated user {user.username}")

    # 3.1) Creator => gets CRUD
    if getattr(instance, "creator_id", None) == user.id:
        logger.debug("User is creator - granting CRUD permissions")
        for action in ["create", "read", "update", "delete"]:
            final_codenames.add(_get_db_codename_for_action(action, model_name))

    # 3.2) is_public => read
    if getattr(instance, "is_public", False):
        logger.debug("Instance is public - granting read permission")
        final_codenames.add(_get_db_codename_for_action("read", model_name))

    # 3.3) corpus fallback => read
    # Single object approach:
    if hasattr(instance, "corpus") and instance.corpus:
        logger.debug(f"Instance has corpus attribute: {instance.corpus}")
        visible_corpora = Corpus.objects.visible_to_user(user).filter(
            pk=instance.corpus.pk
        )
        if visible_corpora.exists():
            logger.debug("Corpus is visible to user - granting read permission")
            final_codenames.add(_get_db_codename_for_action("read", model_name))

    # 3.4) Guardian permissions (user + optional groups)
    logger.debug("Checking Guardian permissions")
    user_perm_codenames = set()

    # user-level perms
    user_perms = UserObjectPermission.objects.filter(
        object_pk=str(instance.pk),
        user=user,
        content_type__app_label=app_label,
        content_type__model=model_name,
    ).values_list("permission__codename", flat=True)
    logger.debug(f"Direct user permissions from Guardian: {list(user_perms)}")
    user_perm_codenames.update(user_perms)

    # group-level perms (optional)
    if include_group_permissions:
        logger.debug("Including group permissions")
        user_groups = user.groups.all()
        logger.debug(f"User groups: {[g.name for g in user_groups]}")

        group_perms = GroupObjectPermission.objects.filter(
            object_pk=str(instance.pk),
            group__in=user_groups,
            content_type__app_label=app_label,
            content_type__model=model_name,
        ).values_list("permission__codename", flat=True)
        logger.debug(f"Group permissions from Guardian: {list(group_perms)}")
        user_perm_codenames.update(group_perms)

    # Add all the guardian perms to our final set
    logger.debug(f"All Guardian permissions: {user_perm_codenames}")
    final_codenames.update(user_perm_codenames)

    logger.debug(f"Final codenames for user {user.username}: {final_codenames}")
    return final_codenames
