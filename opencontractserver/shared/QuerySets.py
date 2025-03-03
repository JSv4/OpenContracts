from django.contrib.auth import get_user_model
from django.db import models

# from guardian.models import UserObjectPermission, GroupObjectPermission
from django.db.models import Exists, OuterRef, Q

# from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from tree_queries.query import TreeQuerySet
from django.contrib.auth.models import AnonymousUser
from guardian.shortcuts import get_objects_for_user

User = get_user_model()


class PermissionedTreeQuerySet(TreeQuerySet):
    def approved(self):
        return self.filter(approved=True)

    def rejected(self):
        return self.filter(rejected=True)

    def pending(self):
        return self.filter(approved=False, rejected=False)

    def recent(self, days=30):
        recent_date = timezone.now() - timezone.timedelta(days=days)
        return self.filter(created__gte=recent_date)

    def with_comments(self):
        return self.exclude(comment="")

    def by_creator(self, creator):
        return self.filter(creator=creator)

    def visible_to_user(self, user):
        """
        Gets queryset with_tree_fields that is visible to user. At moment, we're JUST filtering
        on creator and is_public, BUT this will filter on per-obj permissions later.
        """

        if user.is_superuser:
            return self.all()

        if user.is_anonymous:
            queryset = self.filter(Q(is_public=True)).distinct()
        else:
            queryset = self.filter(Q(creator=user) | Q(is_public=True)).distinct()

        return queryset.with_tree_fields()

    def with_tree_fields(self):
        return super().with_tree_fields()


class UserFeedbackQuerySet(models.QuerySet):
    def approved(self):
        return self.filter(approved=True)

    def rejected(self):
        return self.filter(rejected=True)

    def pending(self):
        return self.filter(approved=False, rejected=False)

    def recent(self, days=30):
        recent_date = timezone.now() - timezone.timedelta(days=days)
        return self.filter(created__gte=recent_date)

    def with_comments(self):
        return self.exclude(comment="")

    def by_creator(self, creator):
        return self.filter(creator=creator)

    def visible_to_user(self, user):
        from opencontractserver.annotations.models import (  # Import here to avoid circular imports
            Annotation,
        )

        if user.is_superuser:
            return self.all()

        if user.is_anonymous:
            return self.filter(Q(is_public=True)).distinct()

        return self.filter(
            Q(creator=user)
            | Q(is_public=True)
            | Q(commented_annotation__isnull=False)
            & Exists(
                Annotation.objects.filter(
                    id=OuterRef("commented_annotation"), is_public=True
                )
            )
        ).distinct()


class PermissionQuerySet(models.QuerySet):
    def visible_to_user(self, user):
        """
        Filter queryset to only include objects the user has permission to view.
        Uses the hierarchical permission system that checks:
        1. Direct object permissions
        2. Inherited corpus permissions
        3. Public status or creator ownership
        """
        from opencontractserver.utils.permissioning import filter_queryset_by_permission
        
        # Use the centralized permission filtering logic
        return filter_queryset_by_permission(
            queryset=self,
            user=user,
            permission='view'  # or 'read' depending on your permission naming
        )
    
    def editable_by_user(self, user):
        """
        Filter queryset to only include objects the user has permission to edit.
        """
        from opencontractserver.utils.permissioning import filter_queryset_by_permission
        
        return filter_queryset_by_permission(
            queryset=self,
            user=user,
            permission='change'  # or 'update' depending on your permission naming
        )
    
    # Keep other useful methods
    def approved(self):
        return self.filter(approved=True)
    
    def recent(self, days=30):
        recent_date = timezone.now() - timezone.timedelta(days=days)
        return self.filter(created__gte=recent_date)
    
    def by_creator(self, creator):
        return self.filter(creator=creator)
