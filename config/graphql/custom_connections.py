import logging

from graphene import Connection, Int
from graphene_django.filter import DjangoFilterConnectionField


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


class CustomPermissionFilteredConnection(Connection):
    class Meta:
        abstract = True

    @classmethod
    def connection_resolver(cls, resolver, connection, default_manager, max_limit,
                            enforce_first_or_last, filterset_class, filtering_args,
                            root, info, **args):

        # Get the model from the default_manager
        model = default_manager.model

        # Check if the user has the required permission
        user = info.context.user
        if not user.has_perm(f'read_{model._meta.model_name}') and not model.is_public:
            return super(CustomPermissionFilteredConnection, cls).connection_resolver(
                lambda *args, **kwargs: default_manager.none(),
                connection,
                default_manager,
                max_limit,
                enforce_first_or_last,
                filterset_class,
                filtering_args,
                root,
                info,
                **args
            )

        return super(CustomPermissionFilteredConnection, cls).connection_resolver(
            resolver,
            connection,
            default_manager,
            max_limit,
            enforce_first_or_last,
            filterset_class,
            filtering_args,
            root,
            info,
            **args
        )


class CustomDjangoFilterConnectionField(DjangoFilterConnectionField):
    @classmethod
    def connection_resolver(cls, resolver, connection, default_manager, max_limit,
                            enforce_first_or_last, filterset_class, filtering_args,
                            root, info, **args):
        return CustomPermissionFilteredConnection.connection_resolver(
            resolver,
            connection,
            default_manager,
            max_limit,
            enforce_first_or_last,
            filterset_class,
            filtering_args,
            root,
            info,
            **args
        )
