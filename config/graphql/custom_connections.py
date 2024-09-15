import logging

from collections import OrderedDict
from functools import partial

from django.core.exceptions import ValidationError

from graphene import Connection, Int
from graphene.types.argument import to_arguments
from graphene.utils.str_converters import to_snake_case
from graphene_django.filter.fields import convert_enum, DjangoFilterConnectionField

logger = logging.getLogger(__name__)


class PdfPageAwareConnection(Connection):
    class Meta:
        abstract = True

    current_page = Int()
    page_count = Int()

    def resolve_current_page(root, info, **kwargs):
        # print(
        #     f"PdfPageAwareConnection- resolve_total_count kwargs: {kwargs} / root {dir(root)} / iteracble "
        #     f"{root.iterable.count()}"
        # )
        return 1

    def resolve_page_count(root, info, **kwargs):

        largest_page_number = max(
            list(root.iterable.values_list("page", flat=True).distinct())
        )
        # print(f"Unique page list: {largest_page_number}")

        # print(f"PdfPageAwareConnection - resolve_edge_count kwargs: {kwargs}")
        return largest_page_number


class CustomDjangoFilterConnectionField(DjangoFilterConnectionField):
    def __init__(
        self,
        type_,
        fields=None,
        order_by=None,
        extra_filter_meta=None,
        filterset_class=None,
        *args,
        **kwargs
    ):
        print(F"CustomDjangoFilterConnectionField - kwargs: {kwargs}")
        super().__init__(type_, fields, order_by, extra_filter_meta, filterset_class, *args, **kwargs)

    @property
    def args(self):
        return to_arguments(self._base_args or OrderedDict(), self.filtering_args)

    @args.setter
    def args(self, args):
        self._base_args = args

    @classmethod
    def resolve_queryset(
        cls, connection, iterable, info, args, filtering_args, filterset_class
    ):
        def filter_kwargs():
            kwargs = {}
            for k, v in args.items():
                if k in filtering_args:
                    if k == "order_by" and v is not None:
                        v = to_snake_case(v)
                    kwargs[k] = convert_enum(v)
            return kwargs

        qs = super(DjangoFilterConnectionField, cls).resolve_queryset(
            connection, iterable, info, args
        )

        filterset = filterset_class(
            data=filter_kwargs(), queryset=qs, request=info.context
        )

        if filterset.is_valid():
            qs = filterset.qs
            # Apply permission filtering
            model = qs.model
            user = info.context.user
            if hasattr(model, 'get_queryset'):
                qs = model.get_queryset(qs, user)
            elif hasattr(model, 'objects') and hasattr(model.objects, 'get_queryset'):
                qs = model.objects.get_queryset(qs, user)
            return qs
        raise ValidationError(filterset.form.errors.as_json())

    def get_queryset_resolver(self):
        return partial(
            self.resolve_queryset,
            filterset_class=self.filterset_class,
            filtering_args=self.filtering_args,
        )
