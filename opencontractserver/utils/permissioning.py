from __future__ import annotations

import logging
from typing import Union, Optional, Set, Dict, List, Type, Tuple

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.db import transaction, models
from django.db.models import Q, QuerySet
from guardian.shortcuts import assign_perm, get_perms, get_objects_for_user

from opencontractserver.corpuses.models import Corpus
from opencontractserver.types.enums import PermissionTypes

User = get_user_model()
logger = logging.getLogger(__name__)

def resolve_user(user: Union[User, int, str]) -> User:
    """Resolve a user given an int (id), a string (username or numeric id), or a User instance."""
    logger = logging.getLogger(__name__)
    
    try:
        if isinstance(user, str) and user.isdigit():
            logger.debug(f"RESOLVE_USER: Resolving numeric string '{user}' as user ID")
            resolved_user = User.objects.get(id=int(user))
            logger.info(f"RESOLVE_USER: Successfully resolved user ID {user} to user {resolved_user.username}")
            return resolved_user
        elif isinstance(user, str):
            logger.debug(f"RESOLVE_USER: Resolving string '{user}' as username")
            resolved_user = User.objects.get(username=user)
            logger.info(f"RESOLVE_USER: Successfully resolved username '{user}' to user ID {resolved_user.id}")
            return resolved_user
        elif isinstance(user, int):
            logger.debug(f"RESOLVE_USER: Resolving int {user} as user ID")
            resolved_user = User.objects.get(id=user)
            logger.info(f"RESOLVE_USER: Successfully resolved user ID {user} to user {resolved_user.username}")
            return resolved_user
        elif hasattr(user, 'id'):
            logger.debug(f"RESOLVE_USER: User object already provided (ID: {user.id}, username: {user.username})")
            return user
        else:
            logger.error(f"RESOLVE_USER: Invalid user argument type: {type(user)}")
            raise ValueError(f"Invalid user argument type: {type(user)}, expected int, str, or User object")
    except User.DoesNotExist as e:
        logger.error(f"RESOLVE_USER: User not found: {str(e)}")
        raise

# ===== CORE PERMISSION CHECKING LOGIC =====

def _evaluate_permission_rules(
    user: Union[User, AnonymousUser],
    model_or_instance: Union[Type[models.Model], models.Model],
    permission: Union[str, PermissionTypes],
    is_queryset_filter: bool = False
) -> Tuple[bool, str]:
    """
    Shared core logic for permission checks, used by both individual object checks
    and queryset filtering.
    
    Args:
        user: User to check permissions for
        model_or_instance: Model class or instance to check permissions on
        permission: Permission to check (string codename or PermissionTypes enum)
        is_queryset_filter: Whether this is being called for queryset filtering (vs individual object)
        
    Returns:
        Tuple[bool, str]: (superuser_status, permission_codename) where:
            - superuser_status is True if user is a superuser
            - permission_codename is the resolved codename string
    """
    # Determine model and model name
    if isinstance(model_or_instance, type):
        # It's a model class
        model = model_or_instance
        model_name = model._meta.model_name
        # Create temporary instance for permission codename resolution
        instance = model()
    else:
        # It's a model instance
        instance = model_or_instance
        model = instance.__class__
        model_name = model._meta.model_name
    
    # Determine permission codename
    if isinstance(permission, PermissionTypes):
        perm_codename = _get_permission_codename(permission, instance)
    elif '_' not in permission:
        # Handle simple permission names (e.g., 'view', 'edit')
        # Special case mapping: 'view' -> 'read' to maintain compatibility
        if permission == 'view' and model_name == 'corpus':
            perm_codename = "read_corpus"
        else:
            perm_codename = f"{permission}_{model_name}"
    else:
        # It's already a full codename
        perm_codename = permission

    # Always grant permission to superusers
    is_superuser = hasattr(user, 'is_superuser') and user.is_superuser
    
    return is_superuser, perm_codename

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
            user = resolve_user(user)
        except User.DoesNotExist:
            return False
    
    # Apply shared permission rules
    is_superuser, perm_codename = _evaluate_permission_rules(
        user=user,
        model_or_instance=obj,
        permission=permission,
        is_queryset_filter=False
    )
    
    # Superuser always has permission
    if is_superuser:
        return True
    
    # Anonymous users only get public objects
    if not hasattr(user, 'is_authenticated') or not user.is_authenticated:
        # For read/view permissions, check if object is public
        if perm_codename.startswith('read_') or perm_codename.startswith('view_'):
            return getattr(obj, 'is_public', False)
        return False  # Non-read permissions denied for anonymous users
    
    # 1. Check direct object permission
    if _has_direct_permission(user, obj, perm_codename, include_group_permissions):
        return True
    
    # 2. Check corpus inheritance if applicable
    model_class = obj.__class__
    model_name = model_class._meta.model_name
    
    # Import here to avoid circular imports (Corpus is imported for type hints at module level)
    from opencontractserver.corpuses.models import Corpus as CorpusModel
    
    # Skip if this is a Corpus object itself (would be circular)
    if model_class == CorpusModel:
        # Skip to step 3
        pass
    else:
        # Check if model has opted in to inheritance
        inherits_corpus_permissions = getattr(model_class, 'INHERITS_CORPUS_PERMISSIONS', False)
        
        if inherits_corpus_permissions:
            corpus_perm = _map_to_corpus_permission(perm_codename)
            
            # Special case for Document model - check corpuses it belongs to
            if model_name == 'document':
                # Find all related Corpus objects through M2M
                try:
                    # Use the reverse relation manager to get all related corpuses
                    related_corpuses = list(getattr(obj, 'corpus_set', {}).all())
                    
                    # Check permission on each related corpus
                    for corpus in related_corpuses:
                        if _has_direct_permission(user, corpus, corpus_perm, include_group_permissions):
                            logger.debug(f"PERM CHECK: User has permission {corpus_perm} on related corpus {corpus.id}")
                            return True
                except Exception as e:
                    logger.warning(f"PERM CHECK: Error checking M2M relationship: {str(e)}")
            
            # Check direct corpus field
            corpus = getattr(obj, 'corpus', None)
            if corpus is not None and corpus != obj:
                if _has_direct_permission(user, corpus, corpus_perm, include_group_permissions):
                    logger.debug(f"PERM CHECK: User has permission {corpus_perm} on parent corpus {corpus.id}")
                    return True
    
    # 3. Check public status (for read/view) or creator ownership
    if perm_codename.startswith('read_') or perm_codename.startswith('view_'):
        if getattr(obj, 'is_public', False):
            return True
    
    # 4. Check creator ownership
    if hasattr(obj, 'creator') and obj.creator == user:
        # Creators can always view their own objects
        if perm_codename.startswith('read_') or perm_codename.startswith('view_'):
            return True
            
        # For delete/remove/change/update permissions, always grant to creator
        # This ensures owners can delete their own objects
        if (perm_codename.startswith('remove_') or 
            perm_codename.startswith('delete_') or
            perm_codename.startswith('change_') or
            perm_codename.startswith('update_')):
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
    """
    Map a model permission to its corpus equivalent.
    
    Special case: 'view_*' permissions map to 'read_corpus' since
    that's how the permissions are defined in the Corpus model.
    """
    # Extract the action part (read, update, etc.)
    action = perm_codename.split('_')[0]
    
    # Special case: map 'view_*' to 'read_corpus'
    # Sigh this is because we use read for some models and view for others...
    # TODO: fix this by renaming the permissions in the Corpus model
    if action == 'view':
        return "read_corpus"
    
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
    logger = logging.getLogger(__name__)
    
    try:
        user = resolve_user(user)
    except User.DoesNotExist:
        logger.warning('User matching query does not exist in set_object_permissions. Skipping permission assignment.')
        return

    model_name = obj._meta.model_name
    app_label = obj._meta.app_label
    
    logger.debug(f"SET_OBJECT_PERMISSIONS: Setting permissions for user {user.username} on {model_name} {obj.id}")
    
    try:
        # First, remove existing permissions
        with transaction.atomic():
            existing_permissions = getattr(obj, f"{model_name}userobjectpermission_set")
            existing_permissions.filter(user=user).delete()
            logger.debug(f"SET_OBJECT_PERMISSIONS: Removed existing permissions for user {user.username}")
        
        # Convert all permissions to codenames, expanding composite permissions
        perm_codenames = []
        for perm in permissions:
            try:
                codenames = _get_permission_codenames(perm, obj)
                perm_codenames.extend(codenames)
                logger.debug(f"SET_OBJECT_PERMISSIONS: Expanded permission {perm} to {codenames}")
            except Exception as e:
                logger.error(f"SET_OBJECT_PERMISSIONS: Error expanding permission {perm}: {str(e)}")
        
        # Add new permissions
        with transaction.atomic():
            for perm_codename in perm_codenames:
                try:
                    assign_perm(perm_codename, user, obj)
                    logger.debug(f"SET_OBJECT_PERMISSIONS: Assigned permission {perm_codename} to user {user.username}")
                except Exception as e:
                    logger.error(f"SET_OBJECT_PERMISSIONS: Error assigning permission {perm_codename}: {str(e)}")
        
        logger.info(f"SET_OBJECT_PERMISSIONS: Successfully set permissions for user {user.username} on {model_name} {obj.id}")
    except Exception as e:
        logger.error(f"SET_OBJECT_PERMISSIONS: Unexpected error: {str(e)}")
        # Don't re-raise to maintain backward compatibility

# ===== QUERYSET FILTERING =====

def filter_queryset_by_permission(
    queryset: models.QuerySet,
    user: Union[User, AnonymousUser],
    permission: Union[str, PermissionTypes] = 'view',
) -> models.QuerySet:
    """
    Filter a queryset to only include objects the user has permission to access.
    
    Permission filtering rules:
    1. Superusers get access to everything
    2. Users get access to:
       - Objects they have explicit permissions on
       - Objects in a corpus they have permissions on (if model inherits corpus permissions) 
       - Public objects
       - Objects they created
       
    Args:
        queryset: The queryset to filter
        user: User requesting access
        permission: Permission to check (view, edit, etc.)
        
    Returns:
        Filtered queryset with only the objects the user can access
    """
    model = queryset.model
    logger.info(f"FILTER on model ({type(model)}): {model}")
    model_name = model._meta.model_name
    logger.info(f"MODEL NAME: {model_name}")
    
    # Apply shared permission rules
    is_superuser, perm_codename = _evaluate_permission_rules(
        user=user,
        model_or_instance=model, 
        permission=permission,
        is_queryset_filter=True
    )
    
    logger.debug(f"FILTER: {model_name} with permission {perm_codename}")
    
    # Step 1: Superusers get everything
    if is_superuser:
        logger.debug(f"FILTER: Superuser access granted for {model_name}")
        return queryset
    
    # Step 2: For anonymous users, only return public objects
    if not hasattr(user, 'is_authenticated') or not user.is_authenticated:
        logger.debug(f"FILTER: Anonymous user, returning only public {model_name}")
        return queryset.filter(is_public=True)
    
    # Step 3: For authenticated users, build combined filter
    try:
        logger.debug(f"FILTER: Starting permission filtering for {model_name} with {queryset.count()} objects")
        
        # Always include objects with direct permissions
        direct_perm_qs = get_objects_for_user(
            user, 
            perm_codename, 
            queryset,
            with_superuser=False,  # We handle superusers separately
            accept_global_perms=False  # Only want object-level permissions here
        )
        
        # If no direct permissions found and this is a corpus model
        # and we're using 'view_corpus', try again with 'read_corpus'
        if direct_perm_qs.count() == 0 and model_name == 'corpus' and perm_codename == 'view_corpus':
            direct_perm_qs = get_objects_for_user(
                user, 
                'read_corpus', 
                queryset,
                with_superuser=False,
                accept_global_perms=False
            )
            logger.debug(f"FILTER: Retried with read_corpus permission, found {direct_perm_qs.count()} corpus objects")
        
        logger.debug(f"FILTER: User has direct permission on {direct_perm_qs.count()} {model_name} objects")
        
        # Determine what the user owns or has public access to
        common_conditions = Q(is_public=True)
        if hasattr(model, 'creator'):
            logger.debug(f"FILTER: Model {model_name} has creator field, adding ownership condition")
            common_conditions |= Q(creator=user)
        else:
            logger.debug(f"FILTER: Model {model_name} has no creator field, skipping ownership condition")
            
        # Base access: direct permissions or public/owned objects
        public_or_owned = queryset.filter(common_conditions)
        logger.debug(f"FILTER: Found {public_or_owned.count()} public or owned {model_name} objects")
        
        # Combined queryset so far
        filtered_qs = direct_perm_qs | public_or_owned
        logger.debug(f"FILTER: Combined direct permissions and public/owned: {filtered_qs.count()} objects")
        
        # If this model can inherit corpus permissions, add those objects too
        # Import here to avoid circular imports
        from opencontractserver.corpuses.models import Corpus
        logger.debug(f"FILTER: Checking if {model_name} inherits corpus permissions")

        # Skip inheritance for Corpus model itself (would be circular)
        inherits_corpus_permissions = getattr(model, 'INHERITS_CORPUS_PERMISSIONS', False)
        logger.debug(f"FILTER: Model {model_name} inherits_corpus_permissions = {inherits_corpus_permissions}")
        
        if model != Corpus and inherits_corpus_permissions:
            logger.debug(f"FILTER: Processing corpus permission inheritance for {model_name}")
            # Get the corpus permission equivalent
            corpus_perm = _map_to_corpus_permission(perm_codename)
            logger.debug(f"FILTER: Mapped permission {perm_codename} to corpus permission {corpus_perm}")
            
            # Get all corpuses the user has permission on
            corpus_qs = get_objects_for_user(user, corpus_perm, Corpus.objects.all())
            logger.debug(f"FILTER: User has {corpus_perm} permission on {corpus_qs.count()} corpuses")
            
            if corpus_qs.exists():
                logger.debug(f"FILTER: User has access to {corpus_qs.count()} corpuses via {corpus_perm}")
                corpus_inherited = queryset.none()
                logger.debug(f"FILTER: Initialized empty corpus_inherited queryset")
                
                # Handle direct corpus field if it exists
                if hasattr(model, 'corpus'):
                    logger.debug(f"FILTER: Model {model_name} has direct corpus field")
                    try:
                        # For inheriting corpus permissions, we need to:
                        # 1. Include ALL items (public and private) from corpuses where the user has permission
                        # This is intentional - corpus permission inheritance means objects inside the corpus 
                        # are accessible if the user has permission on the corpus
                        direct_corpus = queryset.filter(corpus__in=corpus_qs)
                        logger.debug(f"FILTER: Found {direct_corpus.count()} via direct corpus field")
                        corpus_inherited = corpus_inherited | direct_corpus
                        logger.debug(f"FILTER: Added direct corpus objects, corpus_inherited now has {corpus_inherited.count()} objects")
                    except Exception as e:
                        logger.warning(f"FILTER: Error with direct corpus filter: {str(e)}")
                else:
                    logger.debug(f"FILTER: Model {model_name} has no direct corpus field")
                
                # Special handling for Document model - check for M2M relation with Corpus
                if model_name == 'document':
                    logger.debug(f"FILTER: Special handling for Document model")
                    # Find all M2M relations from Corpus to this model
                    corpus_m2m_fields = []
                    for field in Corpus._meta.get_fields():
                        if field.many_to_many and field.related_model == model:
                            corpus_m2m_fields.append(field.name)
                    
                    logger.debug(f"FILTER: Found M2M fields from Corpus to Document: {corpus_m2m_fields}")
                    
                    # Use those fields to find objects via M2M relationship
                    for field_name in corpus_m2m_fields:
                        logger.debug(f"FILTER: Processing M2M field {field_name}")
                        try:
                            # The double-underscore lookup traverses the M2M relationship
                            # This builds a condition like: document__in=corpus_qs.values_list('documents')
                            m2m_filter = {}
                            m2m_filter[f"{model_name}__in"] = queryset  # Filter documents in our queryset
                            logger.debug(f"FILTER: Created M2M filter: {m2m_filter}")
                            
                            # Find all corpus objects that have these documents AND user has permission on
                            related_corpuses = corpus_qs.filter(**m2m_filter)
                            logger.debug(f"FILTER: Found {related_corpuses.count()} related corpuses with permission")
                            
                            if related_corpuses.exists():
                                logger.debug(f"FILTER: Processing {related_corpuses.count()} related corpuses")
                                # Now get all documents from these corpuses
                                for corpus in related_corpuses:
                                    logger.debug(f"FILTER: Getting {field_name} from corpus {corpus.id}")
                                    related_objects = getattr(corpus, field_name).all()
                                    logger.debug(f"FILTER: Corpus {corpus.id} has {related_objects.count()} related {field_name}")
                                    
                                    # Filter to only include objects from our original queryset
                                    before_count = corpus_inherited.count()
                                    corpus_inherited = corpus_inherited | related_objects.filter(id__in=queryset.values_list('id', flat=True))
                                    after_count = corpus_inherited.count()
                                    logger.debug(f"FILTER: Added {after_count - before_count} objects from corpus {corpus.id}")
                                
                                logger.debug(f"FILTER: Found {corpus_inherited.count()} via M2M relation {field_name}")
                        except Exception as e:
                            logger.warning(f"FILTER: Error with M2M filter {field_name}: {str(e)}", exc_info=True)
                
                # Add corpus-inherited objects to our filtered queryset
                if corpus_inherited.exists():
                    before_count = filtered_qs.count()
                    filtered_qs = filtered_qs | corpus_inherited
                    after_count = filtered_qs.count()
                    logger.debug(f"FILTER: Added {after_count - before_count} objects from corpus permissions")
            else:
                logger.debug(f"FILTER: User has no corpus permissions, skipping inheritance")
        else:
            logger.debug(f"FILTER: Skipping corpus inheritance for {model_name}")
        
        # Return distinct objects
        result = filtered_qs.distinct()
        logger.debug(f"FILTER: Final result has {result.count()} {model_name} objects (from original {queryset.count()})")
        return result
        
    except Exception as e:
        logger.error(f"FILTER: Error in permission filtering for {model_name}: {str(e)}", exc_info=True)
        # Fallback to just public/owned for safety
        return queryset.filter(Q(is_public=True) | Q(creator=user))

# ===== BACKWARD COMPATIBILITY FUNCTIONS =====

def user_has_permission_for_obj(
    user_val: Union[int, str, User],
    instance: models.Model,
    permission: PermissionTypes,
    include_group_permissions: bool = True,
) -> bool:
    """
    Check if a user has permission on an object.
    
    This is a backward compatibility function that delegates to check_effective_permission.
    
    Args:
        user_val: User instance, ID, or username
        instance: Model instance to check permissions on
        permission: Permission to check (PermissionTypes enum)
        include_group_permissions: Whether to include permissions from user's groups
        
    Returns:
        bool: True if the user has permission on the object, False otherwise
    """
    return check_effective_permission(user_val, instance, permission, include_group_permissions)

def set_permissions_for_obj_to_user(
    user_val: Union[int, str, User],
    instance: models.Model,
    permissions: List[PermissionTypes],
) -> None:
    """
    Backward compatibility function for setting permissions.
    
    Args:
        user_val: User instance, ID, or username
        instance: Model instance to set permissions on
        permissions: List of permissions to grant (PermissionTypes enums)
    """
    logger = logging.getLogger(__name__)
    
    try:
        logger.debug(f"SET_PERMISSIONS: Setting permissions {permissions} for user {user_val} on {instance.__class__.__name__} {instance.id}")
        set_object_permissions(user_val, instance, permissions)
        logger.info(f"SET_PERMISSIONS: Successfully set permissions for user on {instance.__class__.__name__} {instance.id}")
    except Exception as e:
        logger.error(f"SET_PERMISSIONS: Error setting permissions: {str(e)}")
        # Don't re-raise the exception to maintain backward compatibility
        # This allows mutations to continue even if permission setting fails