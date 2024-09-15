# import django
# from django.apps import apps
# from django.contrib.auth import get_user_model
# from django.contrib.contenttypes.models import ContentType
# from django.db.models import Prefetch, Q
# from guardian.mixins import UserObjectPermission
# from guardian.models import GroupObjectPermission
# from opencontractserver.utils.permissioning import get_users_group_ids, get_permission_id_to_name_map_for_model
#
# User = get_user_model()
#
#
# def filter_queryset_by_user_read_permission(
#     queryset: django.db.models.QuerySet,
#     user: User,
#     include_group_permissions: bool = True
# ) -> django.db.models.QuerySet:
#     if not queryset.exists():
#         return queryset.none()
#
#     model = queryset.model
#     model_name = model._meta.model_name
#     app_label = model._meta.app_label
#
#     content_type = ContentType.objects.get_for_model(model)
#     permission_id_to_name_map = get_permission_id_to_name_map_for_model(model)
#     read_permission_id = next(
#         (k for k, v in permission_id_to_name_map.items() if v == f"read_{model_name}"),
#         None
#     )
#
#     if read_permission_id is None:
#         return queryset.none()
#
#     user_permission_model = apps.get_model(f'{app_label}.{model_name}userobjectpermission')
#
#     print(f"Get permissions for content type {content_type}")
#
#     user_perms_queryset = user_permission_model.objects.filter(
#         content_object=queryset,
#         user=user,
#         permission_id=read_permission_id
#     )
#
#     group_permission_model =
#     group_perms_queryset = GroupObjectPermission.objects.none()
#     if include_group_permissions:
#         user_group_ids = get_users_group_ids(user)
#         group_perms_queryset = GroupObjectPermission.objects.filter(
#             content_type=content_type,
#             group_id__in=user_group_ids,
#             permission_id=read_permission_id
#         )
#
#     queryset = queryset.prefetch_related(
#         Prefetch(f'{model_name}userobjectpermission_set', queryset=user_perms_queryset, to_attr='user_read_perms'),
#         Prefetch(f'{model_name}groupobjectpermission_set', queryset=group_perms_queryset, to_attr='group_read_perms')
#     )
#
#     return queryset.filter(
#         Q(is_public=True) |
#         Q(**{f'{model_name}userobjectpermission__in': user_perms_queryset}) |
#         Q(**{f'{model_name}groupobjectpermission__in': group_perms_queryset})
#     ).distinct()
#

from django.db.models.query import QuerySet
from django.db.models import Q, Exists, OuterRef
from django.contrib.contenttypes.models import ContentType
from guardian.models import UserObjectPermission, GroupObjectPermission
from django.core.cache import cache

class PermissionQuerySet(QuerySet):
    def for_user(self, user, perm, extra_conditions=None):
        model = self.model
        cache_key = f'content_type_{model._meta.app_label}_{model._meta.model_name}'
        content_type = cache.get(cache_key)
        if content_type is None:
            content_type = ContentType.objects.get_for_model(model)
            cache.set(cache_key, content_type, 3600)  # Cache for 1 hour

        permission_codename = f'{perm}_{model._meta.model_name}'

        # Subqueries for user and group permissions
        user_perm_subquery = UserObjectPermission.objects.filter(
            user=user,
            content_type=content_type,
            object_pk=OuterRef('pk'),
            permission__codename=permission_codename
        ).values('pk')
        group_perm_subquery = GroupObjectPermission.objects.filter(
            group__user=user,
            content_type=content_type,
            object_pk=OuterRef('pk'),
            permission__codename=permission_codename
        ).values('pk')

        # Annotate with permission checks
        qs = self.annotate(
            has_user_perm=Exists(user_perm_subquery),
            has_group_perm=Exists(group_perm_subquery)
        )

        # Base condition: user has the permission
        base_condition = Q(has_user_perm=True) | Q(has_group_perm=True)

        # Default extra conditions based on permission
        if extra_conditions is None:
            if perm == 'read':
                extra_conditions = Q(is_public=True) | Q(creator=user)
            elif perm == 'publish':
                extra_conditions = Q(creator=user)
            else:
                extra_conditions = Q()

        # Combine conditions
        final_condition = base_condition | extra_conditions

        # Apply the filter
        return qs.filter(final_condition).distinct()
