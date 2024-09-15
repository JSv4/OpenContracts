from django.db import models
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from guardian.models import UserObjectPermission, GroupObjectPermission
from django.db.models import Q, Exists, OuterRef

User = get_user_model()


class PermissionQuerySet(models.QuerySet):
    def for_user(self, user, perm):
        model = self.model
        content_type = ContentType.objects.get_for_model(model)

        # Determine the permission codename
        permission_codename = f'{perm}_{model._meta.model_name}'

        # User permission subquery
        user_perm = UserObjectPermission.objects.filter(
            content_type=content_type,
            user=user,
            permission__codename=permission_codename,
            object_pk=OuterRef('pk')
        )

        # Group permission subquery
        group_perm = GroupObjectPermission.objects.filter(
            content_type=content_type,
            group__user=user,
            permission__codename=permission_codename,
            object_pk=OuterRef('pk')
        )

        # Construct the base queryset
        queryset = self.annotate(
            has_user_perm=Exists(user_perm),
            has_group_perm=Exists(group_perm)
        )

        # Filter based on permissions and public status - TODO - make this work for user/obj instance level sharing
        # permission_filter = Q(has_user_perm=True) | Q(has_group_perm=True) | Q(is_public=True)
        permission_filter = Q(is_public=True) | Q(creator=user)

        # # Add extra conditions based on permission type
        # if perm == 'read':
        #     # For read permission, include objects created by the user
        #     permission_filter |= Q(creator=user)
        # elif perm == 'publish':
        #     # For publish permission, only include objects created by the user
        #     permission_filter &= Q(creator=user)

        return queryset.filter(permission_filter).distinct()
