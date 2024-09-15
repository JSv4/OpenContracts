from collections import OrderedDict

import graphene
from graphene_django import DjangoObjectType
from graphene_django.registry import Registry, get_global_registry
from graphene_django.types import ALL_FIELDS
from graphene_django.utils import is_valid_django_model, DJANGO_FILTER_INSTALLED, get_model_fields
from graphene.types.utils import yank_fields_from_attrs
from graphene.types.objecttype import ObjectType, ObjectTypeOptions
from graphene.relay import Connection, Node
from django.core.exceptions import ImproperlyConfigured

from .converter import convert_django_field_with_choices


class CustomDjangoObjectTypeOptions(ObjectTypeOptions):
    model = None
    registry = None
    connection = None
    filter_fields = ()
    filterset_class = None


class CustomDjangoObjectType(DjangoObjectType):
    @classmethod
    def __init_subclass_with_meta__(
        cls,
        model=None,
        registry=None,
        skip_registry=False,
        only_fields=None,
        fields=None,
        exclude_fields=None,
        exclude=None,
        filter_fields=None,
        filterset_class=None,
        connection=None,
        connection_class=None,
        use_connection=None,
        interfaces=(),
        convert_choices_to_enum=True,
        _meta=None,
        **options
    ):
        assert is_valid_django_model(model), (
            'You need to pass a valid Django Model in {}.Meta, received "{}".'
        ).format(cls.__name__, model)

        if not registry:
            registry = get_global_registry()

        assert isinstance(registry, Registry), (
            "The attribute registry in {} needs to be an instance of "
            'Registry, received "{}".'
        ).format(cls.__name__, registry)

        if filter_fields and filterset_class:
            raise ImproperlyConfigured(
                "Can't set both filter_fields and filterset_class"
            )

        if not DJANGO_FILTER_INSTALLED and (filter_fields or filterset_class):
            raise ImproperlyConfigured(
                "Can only set filter_fields or filterset_class if "
                "Django-Filter is installed"
            )

        assert not (fields and exclude), (
            "Cannot set both 'fields' and 'exclude' options on "
            "DjangoObjectType {}.".format(cls.__name__)
        )

        if fields and fields != ALL_FIELDS and not isinstance(fields, (list, tuple)):
            raise TypeError(
                'The `fields` option must be a list or tuple or "__all__". '
                "Got {}".format(type(fields).__name__)
            )

        if exclude and not isinstance(exclude, (list, tuple)):
            raise TypeError(
                "The `exclude` option must be a list or tuple. Got {}".format(
                    type(exclude).__name__
                )
            )

        django_fields = cls.construct_fields(model, registry, fields, exclude, convert_choices_to_enum)

        if use_connection is None and interfaces:
            use_connection = any(issubclass(interface, Node) for interface in interfaces)

        if use_connection and not connection:
            # We create the connection automatically
            if not connection_class:
                connection_class = Connection

            connection = connection_class.create_type(
                "{}Connection".format(options.get("name") or cls.__name__),
                node=cls,
            )

        if connection is not None:
            assert issubclass(connection, Connection), (
                "The connection must be a Connection. Received {}"
            ).format(connection.__name__)

        _meta = CustomDjangoObjectTypeOptions(cls)
        _meta.model = model
        _meta.registry = registry
        _meta.filter_fields = filter_fields
        _meta.filterset_class = filterset_class
        _meta.fields = django_fields
        _meta.connection = connection

        super(DjangoObjectType, cls).__init_subclass_with_meta__(
            _meta=_meta, interfaces=interfaces, **options
        )

        if not skip_registry:
            registry.register(cls)

    @classmethod
    def construct_fields(cls, model, registry, fields, exclude, convert_choices_to_enum):
        _model_fields = get_model_fields(model)

        fields_dict = OrderedDict()
        for name, field in _model_fields:
            is_not_in_only = (
                fields is not None
                and fields != ALL_FIELDS
                and name not in fields
            )
            is_excluded = exclude is not None and name in exclude
            is_no_backref = str(name).endswith("+")
            if is_not_in_only or is_excluded or is_no_backref:
                continue

            _convert_choices_to_enum = convert_choices_to_enum
            if isinstance(_convert_choices_to_enum, (list, tuple)):
                if name in _convert_choices_to_enum:
                    _convert_choices_to_enum = True
                else:
                    _convert_choices_to_enum = False

            converted = convert_django_field_with_choices(
                field, registry, convert_choices_to_enum=_convert_choices_to_enum
            )
            fields_dict[name] = converted

        return yank_fields_from_attrs(fields_dict, _as=graphene.Field)
