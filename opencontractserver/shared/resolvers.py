#  Copyright (C) 2022  John Scrudato

import logging

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import Q, QuerySet
from graphql_relay import from_global_id

from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()

logger = logging.getLogger(__name__)


def resolve_oc_model_queryset(
    django_obj_model_type: type[BaseOCModel] = None, user: User = None
) -> QuerySet[BaseOCModel]:
    """
    Given a model_type and a user instance, resolve a base queryset of the models this user
    could possibly see.
    """

    model_name = django_obj_model_type._meta.model_name
    app_label = django_obj_model_type._meta.app_label

    # Get the base queryset first (only stuff given user CAN see)
    if user.is_superuser:
        queryset = django_obj_model_type.objects.all().order_by("created").distinct()
    # Otherwise, if user is anonymous, try easy query
    elif user.is_anonymous:
        queryset = django_obj_model_type.objects.filter(Q(is_public=True)).distinct()
    # Finally, in all other cases, actually do the hard work
    else:

        permission_model_type = apps.get_model(
            app_label, f"{model_name}userobjectpermission"
        )
        logger.info(f"Got permission model type: {permission_model_type}")

        must_have_permissions = permission_model_type.objects.filter(
            permission__codename=f"read_{model_name}", user_id=user.id
        )
        logger.info(f"Must have permissions: {must_have_permissions}")

        queryset = django_obj_model_type.objects.filter(
            Q(creator=user)
            | Q(is_public=True)
            | Q(**{f"{model_name}userobjectpermission__in": must_have_permissions})
        ).distinct()

    return queryset


def resolve_single_oc_model_from_id(
    model_type: type[BaseOCModel] = None, graphql_id: str = "", user: User = None
) -> BaseOCModel:

    """
    Helper method for resolvers for single objs... gets object with id and makes sure the
    user has sufficient permissions to request it too.
    """

    logger.error(
        f"resolve_single_oc_model_from_id - started for user {user} and model_type {model_type}"
    )

    model_name = model_type._meta.model_name
    app_label = model_type._meta.app_label

    django_pk = from_global_id(graphql_id)[1]

    if user.is_superuser:
        print("User is a superuser... return value")
        obj = model_type.objects.get(id=django_pk)
    elif user.is_anonymous:
        obj = model_type.objects.get(id=django_pk, is_public=True)
    else:

        permission_model_type = apps.get_model(
            app_label, f"{model_name}userobjectpermission"
        )
        logger.info(f"Got permission model type: {permission_model_type}")

        must_have_permissions = permission_model_type.objects.filter(
            permission__codename=f"read_{model_name}", user_id=user.id
        )

        obj_queryset = model_type.objects.filter(
            (
                Q(creator=user)
                | Q(is_public=True)
                | Q(**{f"{model_name}userobjectpermission__in": must_have_permissions})
            )
            & Q(id=django_pk)
        ).distinct()

        logger.info(f"Obj count is {len(obj_queryset)}")
        if len(obj_queryset) == 1:
            obj = obj_queryset[0]
        else:
            obj = None
        logger.info(f"After querying obj level permissions, returned obj is: {obj}")

    return obj
