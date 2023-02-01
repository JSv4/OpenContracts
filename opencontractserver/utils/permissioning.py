from __future__ import annotations

import logging
from functools import reduce
from typing import NoReturn, TypedDict

import django
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from guardian.shortcuts import assign_perm

from config.graphql.permission_annotator.middleware import combine
from opencontractserver.analyzer.models import Analysis
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes

User = get_user_model()

logger = logging.getLogger(__name__)


def set_permissions_for_obj_to_user(
    user_val: int | str | User,
    instance: type[django.db.models.Model],
    permissions: list[PermissionTypes],
) -> NoReturn:

    """
    Given an instance of a django Model, a user id or instance, and a list of desired permissions,
    **REPLACE** current permissions with specified permissions. Pass empty list to permissions to completely
    de-provision a user's permissions.

    This doesn't affect permissions provided from other avenues besides object-level permissions. For example, if
    they're a superuser, they'll still have permissions. Also, if an object is public, they'll still have read
    permissions (assuming they're part of the read public objects group).
    """

    # logger.info(
    #     f"grant_permissions_for_obj_to_user - user ({user_val}) / obj ({instance})"
    # )

    # Provides some flexibility to use ids where passing object is not practical
    if isinstance(user_val, str) or isinstance(user_val, int):
        user = User.objects.get(id=user_val)
    else:
        user = user_val

    model_name = instance._meta.model_name
    # logger.info(f"grant_permissions_for_obj_to_user - Model name: {model_name}")

    app_name = instance._meta.app_label
    # logger.info(f"grant_permissions_for_obj_to_user - App name: {app_name}")

    # First, get rid of old permissions ################################################################################
    with transaction.atomic():
        existing_permissions = getattr(
            instance, f"{model_name}userobjectpermission_set"
        )
        existing_permissions.all().delete()

    # Now, add specified permissions ###################################################################################
    requested_permission_set = set(permissions)
    # logger.info(
    #     f"grant_permissions_for_obj_to_user - Requested permissions: {requested_permission_set}"
    # )

    with transaction.atomic():
        if (
            len(
                {
                    PermissionTypes.CREATE,
                    PermissionTypes.CRUD,
                    PermissionTypes.ALL,
                }.intersection(requested_permission_set)
            )
            > 0
        ):
            assign_perm(f"{app_name}.create_{model_name}", user, instance)

        if (
            len(
                {
                    PermissionTypes.READ,
                    PermissionTypes.CRUD,
                    PermissionTypes.ALL,
                }.intersection(requested_permission_set)
            )
            > 0
        ):
            # logger.info("requested_permission_set - assign read permission")
            assign_perm(f"{app_name}.read_{model_name}", user, instance)

        if (
            len(
                {
                    PermissionTypes.UPDATE,
                    PermissionTypes.CRUD,
                    PermissionTypes.ALL,
                }.intersection(requested_permission_set)
            )
            > 0
        ):
            assign_perm(f"{app_name}.update_{model_name}", user, instance)

        if (
            len(
                {
                    PermissionTypes.DELETE,
                    PermissionTypes.CRUD,
                    PermissionTypes.ALL,
                }.intersection(requested_permission_set)
            )
            > 0
        ):
            assign_perm(f"{app_name}.remove_{model_name}", user, instance)

        if (
            len(
                {PermissionTypes.PERMISSION, PermissionTypes.ALL}.intersection(
                    requested_permission_set
                )
            )
            > 0
        ):
            assign_perm(f"{app_name}.permission_{model_name}", user, instance)

        if (
            len(
                {PermissionTypes.PUBLISH, PermissionTypes.ALL}.intersection(
                    requested_permission_set
                )
            )
            > 0
        ):
            assign_perm(f"{app_name}.publish_{model_name}", user, instance)


def get_users_group_ids(user_instance=User) -> list[str | int]:

    """
    For a given user, return list of group ids it belongs to.
    """

    return list(user_instance.groups.all().values_list("id", flat=True))


def get_permission_id_to_name_map_for_model(
    instance: type[django.db.models.Model],
) -> dict:

    """
    Constantly ran into issues with Django Guardian's helper methods, but working with the database directly I can get
    what I want... namely for each of the permission types that were created in the various models' Meta fields,
    the permission ids, which we can then get on a given object and map back to the permission names for that obj.
    """

    model_name = instance._meta.model_name
    app_label = instance._meta.app_label
    # logger.info(
    #     f"get_permission_id_to_name_map_for_model - App name: {app_label} / model name: {model_name}"
    # )

    model_type = ContentType.objects.get(app_label=app_label, model=model_name)
    this_model_permission_objs = list(
        Permission.objects.filter(content_type_id=model_type.id).values_list(
            "id", "codename"
        )
    )
    this_model_permission_id_map = reduce(combine, this_model_permission_objs, {})
    # logger.info(
    #     f"get_permission_id_to_name_map_for_model - resulting map: {this_model_permission_id_map}"
    # )
    return this_model_permission_id_map


def get_users_permissions_for_obj(
    user: User,
    instance: type[django.db.models.Model],
    include_group_permissions: bool = False,
) -> set[PermissionTypes]:

    model_name = instance._meta.model_name
    # logger.info(
    #     f"get_users_permissions_for_obj() - Starting check for {user.username} with model type {model_name}"
    # )

    # app_label = instance._meta.app_label
    # logger.info(f"get_users_permissions_for_obj - App name: {app_label}")

    this_user_perms = getattr(instance, f"{model_name}userobjectpermission_set")
    # logger.info(f"get_users_permissions_for_obj - this_user_perms: {this_user_perms}")
    permission_id_to_name_map = get_permission_id_to_name_map_for_model(
        instance=instance
    )

    # Build list of permission names from the permission type ids
    model_permissions_for_user = {
        permission_id_to_name_map[perm.permission_id]
        for perm in this_user_perms.filter(user_id=user.id)
    }

    # Don't forget to throw a read permission on if object is public
    if hasattr(instance, "is_public") and instance.is_public:
        model_permissions_for_user.add(f"read_{model_name}")

    # If we're looking at group permissions... add those too
    if include_group_permissions:
        this_users_group_perms = getattr(
            instance, f"{model_name}groupobjectpermission_set"
        ).filter(group_id__in=get_users_group_ids(user_instance=user))
        for perm in this_users_group_perms:
            model_permissions_for_user.add(
                permission_id_to_name_map[perm.permission_id]
            )

    return model_permissions_for_user


def user_has_permission_for_obj(
    user_val: int | str | User,
    instance: type[django.db.models.Model],
    permission: PermissionTypes,
    include_group_permissions: bool = False,
) -> bool:

    """
    Helper method to see make it easier to check if a given user has a certain permission type
    for a given object. Uses database queries to quickly query what permissions on the model for
    provided users intersect with permission defined in specified PermissionType.
    """
    # Provides some flexibility to use ids where passing object is not practical
    if isinstance(user_val, str) or isinstance(user_val, int):
        user = User.objects.get(id=user_val)
    else:
        user = user_val

    model_name = instance._meta.model_name
    # logger.info(
    #     f"get_users_permissions_for_obj() - Starting check for {user.username} with model type {model_name}"
    # )

    # app_label = instance._meta.app_label
    # logger.info(f"get_users_permissions_for_obj - App name: {app_label}")

    model_permissions_for_user = get_users_permissions_for_obj(
        user=user,
        instance=instance,
        include_group_permissions=include_group_permissions,
    )

    # logger.info(
    #     f"user_has_permission_for_obj - user {user} has model_permissions: {model_permissions_for_user}"
    # )

    if permission == PermissionTypes.READ:
        return len(model_permissions_for_user.intersection({f"read_{model_name}"})) > 0
    elif permission == PermissionTypes.UPDATE:
        return (
            len(model_permissions_for_user.intersection({f"update_{model_name}"})) > 0
        )
    elif permission == PermissionTypes.DELETE:
        return (
            len(model_permissions_for_user.intersection({f"remove_{model_name}"})) > 0
        )
    elif permission == PermissionTypes.PUBLISH:
        return (
            len(model_permissions_for_user.intersection({f"publish_{model_name}"})) > 0
        )
    elif permission == PermissionTypes.PERMISSION:
        return (
            len(model_permissions_for_user.intersection({f"permission_{model_name}"}))
            > 0
        )
    elif permission == PermissionTypes.CRUD:
        return (
            len(
                model_permissions_for_user.intersection(
                    {
                        f"create_{model_name}",
                        f"read_{model_name}",
                        f"update_{model_name}",
                        f"remove_{model_name}",
                    }
                )
            )
            == 4
        )
    elif permission == PermissionTypes.ALL:
        return (
            len(
                model_permissions_for_user.intersection(
                    {
                        f"create_{model_name}",
                        f"read_{model_name}",
                        f"update_{model_name}",
                        f"remove_{model_name}",
                        f"publish_{model_name}",
                        f"permission_{model_name}",
                    }
                )
            )
            == 6
        )


class MakePublicReturnType(TypedDict):
    message: str
    ok: bool


def make_analysis_public(analysis_id: int | str) -> MakePublicReturnType:
    """
    Given an analysis ID, make it and its annotations public. If you do this on a
    Corpus that is not itself public, the underlying docs and corpus (and thus
    the analysis itself) can only be seen by those who have at least read permission to the
    Corpus. In current iteration of OC (Sept 22), that basically means only admins
    and the person who created it will see the annotations. Long story short, MAKE
    THE CORPUS PUBLIC TOO USING A SEPARATE CALL.
    """

    ok = False

    try:

        analysis = Analysis.objects.get(id=analysis_id)

        # Lock the analysis as this can take a long time depending on the number of
        # documents and annotations to change permissions for.
        with transaction.atomic():
            analysis.is_public = True
            analysis.backend_lock = True
            analysis.save()

        corpus = analysis.analyzed_corpus

        # Bulk update the analyzers labels
        labels = AnnotationLabel.objects.filter(analyzer=analysis.analyzer)
        for label in labels:
            label.is_public = True
        AnnotationLabel.objects.bulk_update(labels, ["is_public"], batch_size=100)

        # Bulk update actual annotations
        analyzer_annotations = corpus.annotations.filter(analysis_id=analysis_id)
        for annotation in analyzer_annotations:
            # logger.info(f"Make annotation public: {annotation}")
            annotation.is_public = True
        Annotation.objects.bulk_update(
            analyzer_annotations, ["is_public"], batch_size=100
        )

        with transaction.atomic():
            analysis.backend_lock = False
            analysis.save()

        analysis.refresh_from_db()

        message = "SUCCESS - Analysis is Public"
        ok = True

    except Exception as e:
        message = f"ERROR - Could not make analysis public due to unexpected error: {e}"

    return {"message": message, "ok": ok}


def make_corpus_public(corpus_id: int | str) -> MakePublicReturnType:

    """
    Given a corpus ID, make it, its labelset, its docs and its HUMAN annotations
    public. Ignore analyzer-created annotations.
    """

    ok = False

    try:
        corpus = Corpus.objects.get(id=corpus_id)

        # Lock the corpus while we re-permission as this can take a while depending on the
        # number of associated annotations and docs.
        with transaction.atomic():
            corpus.backend_lock = True
            corpus.is_public = True
            corpus.save()

        # Bulk update documents to public
        docs = corpus.documents.all()
        for doc in docs:
            doc.is_public = True
        Document.objects.bulk_update(docs, ["is_public"], batch_size=100)

        # IF there is a label_set for human annotations, handle its permissions
        if corpus.label_set:

            corpus.label_set.is_public = True
            corpus.label_set.save()

            # Bulk update labels to public
            labels = corpus.label_set.annotation_labels.all()
            for label in labels:
                logger.info(f"Make this annotation label public: {label.id}")
                logger.info(f"Make this annotation label public: {label}")
                label.is_public = True
            AnnotationLabel.objects.bulk_update(labels, ["is_public"], batch_size=100)

        # Bulk update actual annotations created by people (NOT ANALYZER)
        # If you want to make an analyzers annotations public, make the analysis
        # public
        annotations = corpus.annotations.filter(analysis__isnull=True)
        for annotation in annotations:
            logger.info(f"Make annotation public: {annotation}")
            annotation.is_public = True
        Annotation.objects.bulk_update(annotations, ["is_public"], batch_size=100)

        # Unlock the corpus now that we're done changing permission
        with transaction.atomic():
            corpus.backend_lock = False
            corpus.save()

        corpus.refresh_from_db()

        message = "SUCCESS - Corpus is Public"
        ok = True

    except Exception as e:
        message = f"ERROR - Could not make public due to unexpected error: {e}"

    return {"message": message, "ok": ok}
