from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from django_cte import CTEQuerySet
from tree_queries.query import TreeQuerySet

from opencontractserver.shared.mixins import VectorSearchViaEmbeddingMixin

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
    def visible_to_user(self, user, perm=None):

        if user.is_superuser:
            return self.all()

        # model = self.model
        # content_type = ContentType.objects.get_for_model(model)
        #
        # # Determine the permission codename
        # permission_codename = f'{perm}_{model._meta.model_name}'
        #
        # # User permission subquery
        # user_perm = UserObjectPermission.objects.filter(
        #     content_type=content_type,
        #     user=user,
        #     permission__codename=permission_codename,
        #     object_pk=OuterRef('pk')
        # )
        #
        # # Group permission subquery
        # group_perm = GroupObjectPermission.objects.filter(
        #     content_type=content_type,
        #     group__user=user,
        #     permission__codename=permission_codename,
        #     object_pk=OuterRef('pk')
        # )

        # Construct the base queryset
        # queryset = self.annotate(
        #     has_user_perm=Exists(user_perm),
        #     has_group_perm=Exists(group_perm)
        # )

        # Filter based on permissions and public status - TODO - make this work for user/obj instance level sharing
        # permission_filter = Q(has_user_perm=True) | Q(has_group_perm=True) | Q(is_public=True)
        permission_filter = Q(is_public=True)
        if not user.is_anonymous:
            permission_filter |= Q(creator=user)

        # # Add extra conditions based on permission type
        # if perm == 'read':
        #     # For read permission, include objects created by the user
        #     permission_filter |= Q(creator=user)
        # elif perm == 'publish':
        #     # For publish permission, only include objects created by the user
        #     permission_filter &= Q(creator=user)

        return self.filter(permission_filter).distinct()


class DocumentQuerySet(PermissionQuerySet, VectorSearchViaEmbeddingMixin):
    """
    Custom QuerySet for Document that includes both permission filtering
    (PermissionQuerySet) and vector-based search (VectorSearchViaEmbeddingMixin).
    """

    # If your Embedding related_name on Document is not "embeddings",
    # override the Mixin attribute here:
    # EMBEDDING_RELATED_NAME = "my_custom_related_name"
    pass


class AnnotationQuerySet(
    CTEQuerySet, PermissionQuerySet, VectorSearchViaEmbeddingMixin
):
    """
    Custom QuerySet for Annotation model, combining:
      - CTEQuerySet for recursive common table expressions
      - PermissionQuerySet for permission-based filtering
      - VectorSearchViaEmbeddingMixin for vector-based search

    Example:
        class AnnotationQuerySet(CTEQuerySet, PermissionQuerySet, VectorSearchViaEmbeddingMixin):
            EMBEDDING_RELATED_NAME = "embeddings"  # or whatever your FK related_name is
    """

    pass


class NoteQuerySet(CTEQuerySet, PermissionQuerySet, VectorSearchViaEmbeddingMixin):
    """
    Custom QuerySet for Note model, combining:
      - CTEQuerySet
      - PermissionQuerySet
      - VectorSearchViaEmbeddingMixin
    """

    pass
