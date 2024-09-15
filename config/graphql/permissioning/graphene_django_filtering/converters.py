from django.db import models

from graphene import (
    Dynamic,
    Field,
)
from graphene_django.converter import get_django_field_description, convert_django_field
from graphene_django.fields import DjangoListField

from config.graphql.custom_connections import CustomDjangoFilterConnectionField


@convert_django_field.register(models.OneToOneRel)
def convert_onetoone_field_to_djangomodel(field, registry=None):
    model = field.related_model

    def dynamic_type():
        _type = registry.get_type_for_model(model)
        if not _type:
            return

        return Field(_type, required=not field.null)

    return Dynamic(dynamic_type)


@convert_django_field.register(models.ManyToManyField)
@convert_django_field.register(models.ManyToManyRel)
@convert_django_field.register(models.ManyToOneRel)
def convert_field_to_list_or_connection(field, registry=None):

    print(f"Custom convert_field_to_list_or_connection running...")

    model = field.related_model

    def dynamic_type():

        print("Dynamic type on convert_field_to_list_or_connection...")

        _type = registry.get_type_for_model(model)
        if not _type:
            return

        if isinstance(field, models.ManyToManyField):
            description = get_django_field_description(field)
        else:
            description = get_django_field_description(field.field)

        # If there is a connection, we should transform the field
        # into a DjangoConnectionField
        if _type._meta.connection:
            # Use a DjangoFilterConnectionField if there are
            # defined filter_fields or a filterset_class in the
            # DjangoObjectType Meta
            # if _type._meta.filter_fields or _type._meta.filterset_class:
            #     from graphene_django.filter.fields import DjangoFilterConnectionField
            #
            #     return DjangoFilterConnectionField(
            #         _type, required=True, description=description
            #     )

            return CustomDjangoFilterConnectionField(_type, required=True, description=description)

        return DjangoListField(
            _type,
            required=True,  # A Set is always returned, never None.
            description=description,
        )

    return Dynamic(dynamic_type)
