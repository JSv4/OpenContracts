import logging
from abc import ABC

import graphene
from graphql import GraphQLError
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.permission_annotator.utils import (
    grant_all_permissions_for_obj_to_user,
)

logger = logging.getLogger(__name__)


def assign_new_obj_permissions(model_instance, user):

    from guardian.shortcuts import assign_perm

    try:

        # Great lil cheat sheet on accessing string props of models:
        # https://stackoverflow.com/questions/3599524/get-class-name-of-django-model
        model_class = model_instance._meta.model
        logger.info(f"assign_new_obj_permissions() - model_class: {model_class}")

        model_name = f"{model_class._meta.model_name}"
        logger.info(f"assign_new_obj_permissions() - model_name: {model_name}")

        app_name = f"{model_class._meta.app_label}"
        logger.info(f"assign_new_obj_permissions() - app_name: {app_name}")

        assign_perm(f"{app_name}.update_{model_name}", user, model_instance)
        assign_perm(f"{app_name}.delete_{model_name}", user, model_instance)
        assign_perm(f"{app_name}.read_{model_name}", user, model_instance)
        assign_perm(f"{app_name}.create_{model_name}", user, model_instance)
        assign_perm(f"{app_name}.permission_{model_name}", user, model_instance)
        logger.info("assign_new_obj_permissions() - permissions assigned")

        model_instance.creator = user
        model_instance.save()
        logger.info(f"assign_new_obj_permissions() - creator assigned: {app_name}")

        return True

    except Exception:
        return False


class CountableConnection(graphene.relay.Connection):
    class Meta:
        abstract = True

    total_count = graphene.Int()

    def resolve_total_count(root, info):
        return len(root.iterable)  # And no, root.iterable.count() did not work for me.


class DRFDeletion(graphene.Mutation):
    class IOSettings(ABC):
        lookup_field = "id"

    class Arguments(ABC):
        id = graphene.String(required=False)

    ok = graphene.Boolean()
    message = graphene.String()

    @classmethod
    @login_required
    def mutate(cls, root, info, *args, **kwargs):

        ok = False

        try:
            id = from_global_id(kwargs.get(cls.IOSettings.lookup_field, None))[1]
            obj = cls.IOSettings.model.objects.get(pk=id)

            # Check user permissions
            user = info.context.user
            if (hasattr(obj, "is_public") and not obj.is_public) and (
                hasattr(obj, "owner") and obj.owner != user
            ):
                raise GraphQLError(
                    "You do no have sufficient permissions to view requested object"
                )

            obj.delete()
            ok = True
            message = "Success!"

        except Exception as e:
            message = f"Failed to delete object due to error: {e}"

        return cls(ok=ok, message=message)


class DRFMutation(graphene.Mutation):
    class IOSettings(ABC):
        pk_fields = []
        lookup_field = "id"
        model = None
        serializer = None

    class Arguments(ABC):
        pass

    ok = graphene.Boolean()
    message = graphene.String()

    @classmethod
    @login_required
    def mutate(cls, root, info, *args, **kwargs):

        ok = False

        try:
            logger.info("Test if context has user")
            if info.context.user:
                logger.info("User id: ", info.context.user.id)
                # We're using the DRF Serializers to build data and edit / save objs
                # We want to pass an ID into the creator field, not the user obj
                kwargs["creator"] = info.context.user.id
            else:
                logger.info("No user")
                raise ValueError("No user in this request...")

            logger.info(f"DRFMutation - kwargs: {kwargs}")
            serializer = cls.IOSettings.serializer

            if hasattr(cls.IOSettings, "pk_fields"):
                for pk_field in cls.IOSettings.pk_fields:
                    if pk_field in kwargs:
                        if isinstance(kwargs[pk_field], list):
                            pk_value = []
                            for global_id in kwargs[pk_field]:
                                pk_value.append(
                                    from_global_id(kwargs.get(global_id, None))[1]
                                )
                        else:
                            pk_value = from_global_id(kwargs.get(pk_field, None))[1]
                        kwargs[pk_field] = pk_value

            if cls.IOSettings.lookup_field in kwargs:
                logger.info("Lookup_field specified - update")
                obj = cls.IOSettings.model.objects.get(
                    pk=from_global_id(kwargs.get(cls.IOSettings.lookup_field, None))[1]
                )
                obj_serializer = serializer(obj, data=kwargs, partial=True)
                obj_serializer.is_valid(raise_exception=True)
                obj_serializer.save()
                ok = True
                message = "Success"
                logger.info("Succeeded updating obj")
            else:
                logger.info(
                    f"No lookup field specified... create obj with kwargs: {kwargs}"
                )
                obj_serializer = serializer(data=kwargs)
                obj_serializer.is_valid(raise_exception=True)
                obj = obj_serializer.save()
                logger.info("Created obj", info.context.user)

                # If we created new obj... give user proper permissions
                # assign_new_obj_permissions(obj, info.context.user) - TODO how is this different?
                grant_all_permissions_for_obj_to_user(info.context.user, obj)
                logger.info("Permissioned obj")

                ok = True
                message = "Success"

        except Exception as e:
            message = f"Mutation failed due to error: {e}"

        return cls(ok=ok, message=message)
