import logging

import graphene
from django.conf import settings
from django.contrib.auth import get_user_model
from graphene.types.generic import GenericScalar

from config.graphql.permissioning.permission_annotator.middleware import (
    get_permissions_for_user_on_model_in_app,
)
from opencontractserver.types.enums import PermissionTypes

User = get_user_model()

logger = logging.getLogger(__name__)


class AnnotatePermissionsForReadMixin:

    my_permissions = GenericScalar()
    is_published = graphene.Boolean()
    object_shared_with = GenericScalar()

    def resolve_object_shared_with(self, info):

        logger.info(f"resolve_shared_with - self: {self} / type: {type(self)}")
        logger.info(f"resolve_shared_with - info: {info} / type: {type(info)}")
        logger.info(
            f"resolve_shared_with - info context permissions: {info.context.permission_annotations}"
        )

        values = []
        anon = User.get_anonymous()
        context = info.context

        if context and hasattr(context, "user"):
            user = context.user
            if user.id == anon.id:
                return []

        try:

            permission_annotations = context.permission_annotations
            this_model_permission_id_map = permission_annotations.get(
                "this_model_permission_id_map", {}
            )
            user_permission_map = {}
            model_name = self._meta.model_name
            this_user_perms = getattr(self, f"{model_name}userobjectpermission_set")

            for perm in this_user_perms.all():

                logger.info(f"perm: {perm}")

                if perm.user_id in user_permission_map:
                    user_permission_map[perm.user_id]["permissions"][
                        this_model_permission_id_map[perm.permission_id]
                    ] = this_model_permission_id_map[perm.permission_id]
                else:
                    seed_permission = {
                        this_model_permission_id_map[
                            perm.permission_id
                        ]: this_model_permission_id_map[perm.permission_id]
                    }
                    user_permission_map[perm.user_id] = {
                        "id": perm.user_id,
                        "email": perm.user.email,
                        "username": perm.user.username,
                        "permissions": seed_permission,
                    }

            for value in user_permission_map.values():
                logger.info(f"Value in user_permission_map.values(): {value}")
                values.append(
                    {
                        "id": value["id"],
                        "email": value["email"],
                        "username": value["username"],
                        "permissions": list(value["permissions"].values()),
                    }
                )

        except AttributeError as ae:
            logger.error(f"resolve_shared_with - Attribute Error: {ae}")
            pass

        logger.info(f"Values: {values}")

        return values

    def resolve_my_permissions(self, info) -> list[PermissionTypes]:

        # logger.info(f"resolve_my_permissions() - Start")
        anon = User.get_anonymous()
        # logger.info(f"resolve_my_permissions() - anon: {anon}")
        context = info.context
        # logger.info(f"resolve_my_permissions() - context: {context}")
        user = None

        if context and hasattr(context, "user"):
            # logger.info(f"resolve_my_permissions() - context has attribute user")
            user = context.user
            # logger.info(f"resolve_my_permissions() - user is: {user}")
            if user.id == anon.id:
                # logger.info(f"resolve_my_permissions() - user is anon user")
                return []

        # Looking up permissions in each resolve call is wasteful and slow. A lot of times,
        # where we're getting the permissions on a list of the same object types, we can look up
        # these permissions types ahead of time and then just check the permissions' metadata in these
        # objs loaded into memory. This is done in the middleware... we check for the DjangoModelType model
        # being requested and add to the context the types of permissions applicable to it.
        # NOTE - this falls down in GraphQL (as opposed to a similar approach I used with REST) where you
        # start to request nested objs WITH permissions (as we do in old OpenContractsServer in some cases).
        # for now, my solution to this is to fall back to lookup obj-level permissions in this mixin where
        # the context preloaded_model_types does not include {app_name}.{model_name}.
        #
        # There is certainly a way to try to preload these lookups in the middleware and create a more
        # complex context lookup datastructure to check for preloaded permissions for each model. I don't
        # really have the time or inclination to do this at the moment.
        permission_annotations = (
            context.permission_annotations
            if hasattr(context, "permission_annotations")
            else {}
        )

        model_name = self._meta.model_name
        app_label = self._meta.app_label
        full_name = f"{app_label}.{model_name}"

        permissions = set()

        if self.is_public:
            permissions.add(f"read_{model_name}")

        # logger.info(
        #     f"resolve_my_permissions() - permission_annotations: {permission_annotations}"
        # )

        try:

            # logger.info("resolve_my_permissions() - Proceed to analyze obj-level permissions")
            # If we managed to find the user obj... return its permissions to given obj... otherwise return empty array
            if user:

                try:

                    # logger.info(f"resolve_my_permissions() - _meta: {dir(self._meta)}")
                    # logger.info(f"resolve_my_permissions() - Full name: {full_name}")

                    # Superuser won't have explicit rights in the permission object set YET
                    # superusers have ALL permissions available in django. If user is making
                    # request, annotate all permissions for user
                    if user.is_superuser:
                        # logger.info(
                        #     "resolve_my_permissions() - permissions values "
                        #     f":{permission_annotations[full_name]['this_model_permission_id_map'].values()}"
                        # )
                        permissions.add("superuser")

                        if (
                            full_name in permission_annotations
                            and "this_model_permission_id_map"
                            in permission_annotations[full_name]
                        ):
                            # logger.info(f"resolve_my_permissions() - Fold in permission_annotations...")
                            permissions = permissions.union(
                                {
                                    v
                                    for v in list(
                                        permission_annotations[full_name][
                                            "this_model_permission_id_map"
                                        ].values()
                                    )
                                }
                            )
                        # logger.info(
                        #     f"resolve_my_permissions() - permissions: {permissions}"
                        # )

                    else:

                        # logger.info(
                        #     "resolve_my_permissions() - user is not super user."
                        # )

                        if full_name not in permission_annotations:
                            # logger.warning(
                            #     f"resolve_my_permissions() - trying to annotate but {full_name} "
                            #     f"not in permission map... manually query"
                            # )

                            # Manual lookup here from database
                            model_permissions = (
                                get_permissions_for_user_on_model_in_app(
                                    app_label, model_name, info.context.user
                                )
                            )

                        else:
                            # logger.info(
                            #     f"resolve_my_permissions() - {full_name} is in permission_annoations"
                            # )
                            model_permissions = permission_annotations[full_name]

                        # logger.info(
                        #     f"resolve_my_permissions() - model_name: {model_name}"
                        # )
                        # logger.info(
                        #     f"resolve_my_permissions() - model permissions: {model_permissions}"
                        # )

                        # GET PERMISSION IDS FOR MODEL ####
                        this_user_group_ids = model_permissions.get(
                            "this_user_group_ids", []
                        )
                        # logger.info(
                        #     f"resolve_my_permissions() - this_user_group_ids: {this_user_group_ids}"
                        # )

                        this_model_permission_id_map = model_permissions.get(
                            "this_model_permission_id_map", {}
                        )
                        # logger.info(
                        #     f"resolve_my_permissions() - this_model_permission_id_map:"
                        #     f"{this_model_permission_id_map}"
                        # )

                        can_publish_model_type = model_permissions.get(
                            "can_publish_model_type", False
                        )
                        # logger.info(
                        #     f"resolve_my_permissions() - can_publish_model_type:"
                        #     f"{can_publish_model_type}"
                        # )
                        #####################################################################

                        this_user_perms = getattr(
                            self, f"{model_name}userobjectpermission_set"
                        )
                        # logger.info(
                        #     f"resolve_my_permissions() - this_user_perms: {this_user_perms}"
                        # )

                        this_user_perms = this_user_perms.filter(user_id=user.id)
                        # logger.info(
                        #     f"resolve_my_permissions() - filtered this_user_perms: {this_user_perms}"
                        # )

                        this_users_group_perms = getattr(
                            self, f"{model_name}groupobjectpermission_set"
                        ).filter(group_id__in=this_user_group_ids)
                        # logger.info(
                        #     f"resolve_my_permissions() - this_users_group_perms:"
                        #     f"{this_users_group_perms}"
                        # )

                        # logger.info(
                        #     "resolve_my_permissions() - Analyze this_user_perms"
                        # )
                        for perm in this_user_perms:
                            # logger.info(f"resolve_my_permissions() - Analyze: {perm}")
                            try:
                                permissions.add(
                                    this_model_permission_id_map[perm.permission_id]
                                )
                            except Exception as e:
                                logger.warning(
                                    f"resolve_my_permissions() - Error trying to add "
                                    f"this_user_perm to model_permission_id_map: {e}"
                                )

                        for perm in this_users_group_perms:
                            try:
                                permissions.add(
                                    this_model_permission_id_map[perm.permission_id]
                                )
                            except Exception as e:
                                logger.warning(
                                    f"resolve_my_permissions() - Error trying to add this_users_group_perms "
                                    f"to model_permission_id_map: {e}"
                                )

                        if can_publish_model_type:
                            try:
                                permissions.add(f"publish_{model_name}")
                            except Exception:
                                pass

                    # logger.info(f"resolve_my_permissions() - final permission list: {permission_list}")

                except Exception as e:
                    logger.error(
                        f"resolve_my_permissions() - Error getting my_permissions: {e}"
                    )

        except Exception as e:
            logger.error(
                f"resolve_my_permissions() - unexpected failure in outer try/except: {e}"
            )

        return list(permissions)

    def resolve_is_published(self, obj):

        from guardian.shortcuts import get_groups_with_perms

        return (
            get_groups_with_perms(self, attach_perms=False)
            .filter(name=settings.DEFAULT_PERMISSIONS_GROUP)
            .count()
            == 1
        )
