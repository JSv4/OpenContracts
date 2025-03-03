from __future__ import annotations

import logging
from typing import Union, Optional, Set, Dict, List, Type

import django
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db import transaction, models
from guardian.shortcuts import assign_perm, get_perms

from opencontractserver.types.enums import PermissionTypes

User = get_user_model()
logger = logging.getLogger(__name__)

# ===== CORE PERMISSION CHECKING LOGIC =====

def check_effective_permission(
    user: Union[User, AnonymousUser, int, str],
    obj: models.Model,
    permission: Union[str, PermissionTypes],
    include_group_permissions: bool = True
) -> bool:
    """
    Single source of truth for permission checking.
    
    Checks if a user has effective permission on an object by:
    1. Checking direct object permission
    2. If not found, checking parent corpus permission (unless model opts out)
    3. If not found, checking public/creator status
    
    Args:
        user: User instance, ID, or username
        obj: Model instance to check permissions on
        permission: Permission to check (string codename or PermissionTypes enum)
        include_group_permissions: Whether to include permissions from user's groups
        
    Returns:
        bool: True if user has permission, False otherwise
    """
    # Resolve user if ID or username provided
    if isinstance(user, (int, str)) and not isinstance(user, AnonymousUser):
        try:
            user = User.objects.get(id=user if isinstance(user, int) else None, 
                                   username=user if isinstance(user, str) else None)
        except User.DoesNotExist:
            return False
    
    # Superuser always has permission
    if hasattr(user, 'is_superuser') and user.is_superuser:
        return True
    
    # Convert PermissionTypes enum to permission codename if needed
    perm_codename = _get_permission_codename(permission, obj)
    
    # 1. Check direct object permission
    if _has_direct_permission(user, obj, perm_codename, include_group_permissions):
        return True
    
    # 2. Check corpus inheritance if applicable and model doesn't opt out
    corpus = getattr(obj, 'corpus', None)
    model_class = obj.__class__
    
    # Check if model opts out of corpus permission inheritance
    inherits_corpus_permissions = getattr(model_class, 'INHERITS_CORPUS_PERMISSIONS', False)
    
    if corpus and corpus != obj and inherits_corpus_permissions:  # Avoid self-reference for Corpus objects
        corpus_perm = _map_to_corpus_permission(perm_codename)
        if _has_direct_permission(user, corpus, corpus_perm, include_group_permissions):
            return True
    
    # 3. Check public status
    if perm_codename.startswith('read_') or perm_codename.startswith('view_'):
        if getattr(obj, 'is_public', False):
            return True
    
    # 4. Check creator ownership
    if hasattr(obj, 'creator') and user.is_authenticated and obj.creator == user:
        # Creators can always view their own objects
        if perm_codename.startswith('read_') or perm_codename.startswith('view_'):
            return True
    
    return False

# ===== HELPER FUNCTIONS =====

def _get_permission_codename(
    permission: Union[str, PermissionTypes],
    obj: models.Model
) -> str:
    """
    Convert permission to codename format.
    
    Note: For composite permissions like CRUD or ALL, this returns only the first
    permission codename. Use _get_permission_codenames (plural) for handling
    composite permissions.
    """
    model_name = obj._meta.model_name
    
    # Map PermissionTypes enum to codename
    if isinstance(permission, PermissionTypes):
        if permission == PermissionTypes.READ:
            return f"read_{model_name}"
        elif permission == PermissionTypes.CREATE:
            return f"create_{model_name}"
        elif permission == PermissionTypes.UPDATE:
            return f"update_{model_name}"
        elif permission == PermissionTypes.DELETE:
            return f"remove_{model_name}"
        elif permission == PermissionTypes.PUBLISH:
            return f"publish_{model_name}"
        elif permission == PermissionTypes.PERMISSION:
            return f"permission_{model_name}"
        elif permission == PermissionTypes.EDIT:
            return f"update_{model_name}"  # EDIT maps to UPDATE
        elif permission == PermissionTypes.CRUD:
            # For CRUD, return the first permission (create)
            return f"create_{model_name}"
        elif permission == PermissionTypes.ALL:
            # For ALL, return the first permission (create)
            return f"create_{model_name}"
        else:
            raise ValueError(f"Unsupported permission type: {permission}")

    # If already a string codename, return it
    if isinstance(permission, str):
        # If it already has the model name, return as is
        if f"_{model_name}" in permission:
            return permission
        # Otherwise, append the model name
        return f"{permission}_{model_name}"

def _get_permission_codenames(
    permission: Union[str, PermissionTypes],
    obj: models.Model
) -> List[str]:
    """
    Convert permission to a list of codename formats.
    
    For single permissions, returns a list with one codename.
    For composite permissions like CRUD or ALL, returns a list with multiple codenames.
    
    Args:
        permission: Permission to convert (string or PermissionTypes enum)
        obj: Model instance to get model name from
        
    Returns:
        List[str]: List of permission codenames
    """
    model_name = obj._meta.model_name
    
    # Handle composite permissions
    if isinstance(permission, PermissionTypes):
        if permission == PermissionTypes.CRUD:
            return [
                f"create_{model_name}",
                f"read_{model_name}",
                f"update_{model_name}",
                f"remove_{model_name}"
            ]
        elif permission == PermissionTypes.ALL:
            return [
                f"create_{model_name}",
                f"read_{model_name}",
                f"update_{model_name}",
                f"remove_{model_name}",
                f"publish_{model_name}",
                f"permission_{model_name}"
            ]
    
    # For non-composite permissions, return a list with the single codename
    return [_get_permission_codename(permission, obj)]

def _map_to_corpus_permission(perm_codename: str) -> str:
    """Map a model permission to its corpus equivalent."""
    # Extract the action part (read, update, etc.)
    action = perm_codename.split('_')[0]
    
    # Return the corresponding corpus permission
    return f"{action}_corpus"

def _has_direct_permission(
    user: Union[User, AnonymousUser],
    obj: models.Model,
    perm_codename: str,
    include_group_permissions: bool
) -> bool:
    """Check if user has direct permission on object."""
    from guardian.shortcuts import get_perms
    
    # Anonymous users can't have direct permissions
    if not user.is_authenticated:
        return False
    
    # Use Guardian's get_perms which handles both user and group permissions
    perms = get_perms(user, obj)
    return perm_codename in perms

# ===== PERMISSION MANAGEMENT FUNCTIONS =====

def set_object_permissions(
    user: Union[User, int, str],
    obj: models.Model,
    permissions: List[Union[str, PermissionTypes]],
) -> None:
    """
    Set permissions for a user on an object, replacing any existing permissions.
    
    Args:
        user: User instance, ID, or username
        obj: Model instance to set permissions on
        permissions: List of permissions to grant (string codenames or PermissionTypes enums)
    """
    # Resolve user if ID or username provided
    if isinstance(user, (int, str)):
        logger.info(f"Setting permissions for user ({type(user)}) {user} on object {obj}")
        user = User.objects.get(id=user if isinstance(user, int) else None,
                               username=user if isinstance(user, str) else None)
    
    model_name = obj._meta.model_name
    app_label = obj._meta.app_label
    
    # First, remove existing permissions
    with transaction.atomic():
        existing_permissions = getattr(obj, f"{model_name}userobjectpermission_set")
        existing_permissions.filter(user=user).delete()
    
    # Convert all permissions to codenames, expanding composite permissions
    perm_codenames = []
    for perm in permissions:
        perm_codenames.extend(_get_permission_codenames(perm, obj))
    
    # Add new permissions
    with transaction.atomic():
        for perm_codename in perm_codenames:
            assign_perm(perm_codename, user, obj)

# ===== QUERYSET FILTERING =====

def filter_queryset_by_permission(
    queryset: models.QuerySet,
    user: Union[User, AnonymousUser],
    permission: Union[str, PermissionTypes] = 'view',
) -> models.QuerySet:
    """
    Filter a queryset to only include objects the user has permission to access.
    
    Args:
        queryset: Base queryset to filter
        user: User to check permissions for
        permission: Permission to check (string or PermissionTypes enum)
        
    Returns:
        QuerySet: Filtered queryset
    """
    from django.db.models import Q
    from guardian.shortcuts import get_objects_for_user
    
    model = queryset.model
    model_name = model._meta.model_name
    
    # Convert permission to codename if it's an enum
    if isinstance(permission, PermissionTypes):
        perm_codename = _get_permission_codename(permission, model())
    else:
        # If it's just an action like 'view', convert to full codename
        if '_' not in permission:
            perm_codename = f"{permission}_{model_name}"
        else:
            perm_codename = permission
    
    # Superuser sees everything
    if user.is_superuser:
        return queryset
    
    # Base conditions: public or owned by user
    conditions = Q(is_public=True)
    if user.is_authenticated:
        conditions |= Q(creator=user)
    
    # For authenticated users, add Guardian permissions
    if user.is_authenticated:
        # Get objects with direct permissions
        direct_perm_qs = get_objects_for_user(
            user, perm_codename, queryset
        )
        
        # Add corpus inheritance if applicable
        if hasattr(model, 'corpus'):
            from opencontractserver.corpuses.models import Corpus
            
            corpus_perm = _map_to_corpus_permission(perm_codename)
            corpus_ids = get_objects_for_user(
                user, corpus_perm, Corpus
            ).values_list('id', flat=True)
            
            corpus_inherited_qs = queryset.filter(corpus_id__in=corpus_ids)
            
            # Combine direct and inherited permissions
            return (direct_perm_qs | corpus_inherited_qs | queryset.filter(conditions)).distinct()
        
        # If no corpus field, just use direct permissions
        return (direct_perm_qs | queryset.filter(conditions)).distinct()
    
    # For anonymous users, only return public objects
    return queryset.filter(conditions)

# ===== BACKWARD COMPATIBILITY FUNCTIONS =====

def user_has_permission_for_obj(
    user_val: Union[int, str, User],
    instance: models.Model,
    permission: PermissionTypes,
    include_group_permissions: bool = True,
) -> bool:
    """
    Backward compatibility wrapper for check_effective_permission.
    """
    return check_effective_permission(
        user=user_val,
        obj=instance,
        permission=permission,
        include_group_permissions=include_group_permissions
    )

def set_permissions_for_obj_to_user(
    user_val: Union[int, str, User],
    instance: models.Model,
    permissions: List[PermissionTypes],
) -> None:
    """
    Backward compatibility wrapper for set_object_permissions.
    """
    set_object_permissions(user_val, instance, permissions)