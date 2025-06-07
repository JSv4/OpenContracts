#  Copyright (C) 2022  John Scrudato

import logging

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db.models import Q, QuerySet
from graphql_relay import from_global_id

# Import models directly for type checking (or use strings if preferred to avoid circular imports)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()

logger = logging.getLogger(__name__)


def resolve_oc_model_queryset(
    django_obj_model_type: type[BaseOCModel] = None,
    user: AnonymousUser | User | int | str = None,
) -> QuerySet[BaseOCModel]:
    """
    Given a model_type and a user instance, resolve a base queryset of the models this user
    could possibly see, applying performance optimizations (select/prefetch).
    """
    try:
        if isinstance(user, (int, str)):
            user = User.objects.get(id=user)
        elif not isinstance(user, (User, AnonymousUser)):
            raise ValueError(
                "User must be an instance of AnonymousUser, User, or an integer or string id"
            )
    except User.DoesNotExist:
        logger.error(f"User with id {user} not found.")
        user = None  # Treat as anonymous or raise error? Defaulting to anonymous-like behavior.
    except Exception as e:
        logger.error(
            f"Error resolving user for queryset of model {django_obj_model_type}: {e}"
        )
        user = None

    model_name = django_obj_model_type._meta.model_name
    app_label = django_obj_model_type._meta.app_label

    # Get the base queryset first (only stuff given user CAN see)
    queryset = django_obj_model_type.objects.none()  # Start with an empty queryset

    # Handle the case where user resolution failed explicitly
    if user is None:
        queryset = django_obj_model_type.objects.filter(Q(is_public=True))
    elif user.is_superuser:
        # Apply distinct later if needed after optimizations
        queryset = django_obj_model_type.objects.all().order_by("created")
    elif user.is_anonymous:
        # This branch handles anonymous correctly
        queryset = django_obj_model_type.objects.filter(Q(is_public=True))
    else:  # Authenticated, non-superuser
        permission_model_name = f"{model_name}userobjectpermission"
        try:
            permission_model_type = apps.get_model(app_label, permission_model_name)
            must_have_permissions = permission_model_type.objects.filter(
                permission__codename=f"read_{model_name}", user_id=user.id
            )
            # Apply distinct later if needed after optimizations
            queryset = django_obj_model_type.objects.filter(
                Q(creator=user)
                | Q(is_public=True)
                | Q(**{f"{permission_model_name}__in": must_have_permissions})
            )
        except LookupError:
            logger.warning(
                f"Permission model {app_label}.{permission_model_name}"
                " not found. Falling back to creator/public check."
            )
            # Fallback if permission model doesn't exist (might happen for simpler models)
            queryset = django_obj_model_type.objects.filter(
                Q(creator=user) | Q(is_public=True)
            )

    # --- Apply Performance Optimizations Based on Model Type ---
    if django_obj_model_type == Corpus:
        logger.debug("Applying Corpus specific optimizations")
        queryset = queryset.select_related(
            "creator", "label_set", "user_lock"  # If user_lock info is displayed
        ).prefetch_related(
            "documents"  # Very important if showing document counts or list previews
            # Add other prefetches if CorpusType uses them:
            # 'annotations', 'relationships', 'queries', 'actions', 'notes'
        )
    elif django_obj_model_type == Document:
        logger.debug("Applying Document specific optimizations")
        queryset = queryset.select_related(
            "creator", "user_lock"  # If needed
        ).prefetch_related(
            "doc_annotations",
            "rows",
            "source_relationships",
            "target_relationships",
            "notes",
        )
    # Add elif blocks here for other models needing specific optimizations

    # Apply distinct *after* optimizations if still necessary.
    # Note: Distinct might interact with order_by and prefetch. Test carefully.
    # If the initial query logic already guaranteed distinctness (e.g., simple filters),
    # this might be removable. The permission logic with __in might introduce duplicates.
    queryset = queryset.distinct()

    return queryset


def resolve_single_oc_model_from_id(
    model_type: type[BaseOCModel] = None, graphql_id: str = "", user: User = None
) -> BaseOCModel:
    """
    Helper method for resolvers for single objs... gets object with id and makes sure the
    user has sufficient permissions to request it too. Applies select/prefetch.
    """
    model_name = model_type._meta.model_name
    app_label = model_type._meta.app_label

    try:
        django_pk = from_global_id(graphql_id)[1]
    except Exception as e:
        logger.error(f"Could not decode global ID {graphql_id}: {e}")
        return None  # Or raise GraphQL error

    # --- Apply Performance Optimizations EARLY ---
    base_queryset = model_type.objects.all()  # Start with all for optimization
    if model_type == Corpus:
        logger.debug(
            f"Applying Corpus specific optimizations for single object fetch pk={django_pk}"
        )
        base_queryset = base_queryset.select_related(
            "creator", "label_set", "user_lock"
        ).prefetch_related(
            "documents"
        )  # Prefetch less critical for single object but can be included
    elif model_type == Document:
        logger.debug(
            f"Applying Document specific optimizations for single object fetch pk={django_pk}"
        )
        base_queryset = base_queryset.select_related(
            "creator", "user_lock"
        ).prefetch_related(
            "doc_annotations",
            "rows",
            "source_relationships",
            "target_relationships",
            "notes",
            "embedding_set",
        )
    # Add elif for other models

    # Filter by PK first
    queryset = base_queryset.filter(id=django_pk)

    # Apply Permission Filtering
    obj = None
    if user:
        if user.is_superuser:
            obj = (
                queryset.first()
            )  # Use first() instead of get() to handle potential empty result
        elif user.is_anonymous:
            obj = queryset.filter(is_public=True).first()
        else:
            permission_model_name = f"{model_name}userobjectpermission"
            try:
                permission_model_type = apps.get_model(app_label, permission_model_name)
                must_have_permissions = permission_model_type.objects.filter(
                    permission__codename=f"read_{model_name}", user_id=user.id
                )
                # Filter the already optimized queryset
                obj = (
                    queryset.filter(
                        Q(creator=user)
                        | Q(is_public=True)
                        | Q(**{f"{permission_model_name}__in": must_have_permissions})
                    )
                    .distinct()
                    .first()
                )  # Distinct needed here due to permission join potentially
            except LookupError:
                logger.warning(
                    f"Permission model {app_label}.{permission_model_name} not found."
                    " Falling back to creator/public check for single object."
                )
                obj = queryset.filter(Q(creator=user) | Q(is_public=True)).first()

    if obj is None:
        logger.warning(
            f"Object {model_type.__name__} with pk {django_pk} not found or user {user} lacks permission."
        )
        # Optionally raise an error or return None based on desired GraphQL behavior
        # raise PermissionDenied(f"Access denied or object not found for {model_type.__name__} ID: {graphql_id}")

    return obj
