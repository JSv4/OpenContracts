from typing import Optional

from django.contrib.auth import get_user_model
from django.db.models import Manager, Q
from django_cte import CTEManager

from opencontractserver.shared.QuerySets import (
    AnnotationQuerySet,
    DocumentQuerySet,
    NoteQuerySet,
    PermissionQuerySet,
    UserFeedbackQuerySet,
)

User = get_user_model()


class PermissionManager(Manager):
    def get_queryset(self):
        return PermissionQuerySet(self.model, using=self._db)

    def for_user(self, user, perm, extra_conditions=None):
        return self.get_queryset().for_user(user, perm, extra_conditions)

    def visible_to_user(
        self, user: User, perm: Optional[str] = None
    ) -> PermissionQuerySet:
        """
        Returns queryset filtered by user permission via PermissionQuerySet.
        """
        return self.get_queryset().visible_to_user(user, perm)


class PermissionCTEManager(CTEManager, PermissionManager):
    """
    Helper class for combining CTEManager and PermissionManager in a single MRO.
    We place CTEManager first so the specialized methods (like from_queryset) work,
    and then PermissionManager second to ensure we also use PermissionQuerySet.
    """

    pass


class UserFeedbackManager(PermissionManager):
    def get_queryset(self):
        return UserFeedbackQuerySet(self.model, using=self._db)

    def get_or_none(self, *args, **kwargs):
        try:
            return self.get(*args, **kwargs)
        except self.model.DoesNotExist:
            return None

    def approved(self):
        return self.get_queryset().approved()

    def rejected(self):
        return self.get_queryset().rejected()

    def pending(self):
        return self.get_queryset().pending()

    def recent(self, days=30):
        return self.get_queryset().recent(days)

    def with_comments(self):
        return self.get_queryset().with_comments()

    def by_creator(self, creator):
        return self.get_queryset().by_creator(creator)

    def search(self, query):
        return self.get_queryset().filter(
            Q(comment__icontains=query) | Q(markdown__icontains=query)
        )


class DocumentManager(PermissionManager):
    """
    Extends PermissionManager to return a DocumentQuerySet
    that supports vector searching via the mixin.
    """

    def get_queryset(self):
        return DocumentQuerySet(self.model, using=self._db)

    def search_by_embedding(self, query_vector, embedder_path, top_k=10):
        """
        Convenience method so you can do:
            Document.objects.search_by_embedding([...])
        directly.
        """
        return self.get_queryset().search_by_embedding(
            query_vector, embedder_path, top_k
        )


class AnnotationManager(PermissionCTEManager.from_queryset(AnnotationQuerySet)):
    """
    Custom Manager for the Annotation model that uses:
      - CTEManager (from_queryset)
      - AnnotationQuerySet (with permission checks, optional vector search, etc.)
    """

    def get_queryset(self) -> AnnotationQuerySet:
        return AnnotationQuerySet(self.model, using=self._db)

    def for_user(
        self, user: User, perm: str, extra_conditions: Optional[Q] = None
    ) -> AnnotationQuerySet:
        """
        Filters the queryset based on user permissions.
        """
        return self.get_queryset().for_user(user, perm, extra_conditions)

    def search_by_embedding(self, query_vector, embedder_path, top_k=10):
        """
        If using VectorSearchViaEmbeddingMixin in your AnnotationQuerySet,
        you can call this convenience method just like:
            Annotation.objects.search_by_embedding([0.1, 0.2, ...], "xx-embedder", top_k=10)
        """
        return self.get_queryset().search_by_embedding(
            query_vector, embedder_path, top_k
        )


class NoteManager(PermissionCTEManager.from_queryset(NoteQuerySet)):
    """
    Custom Manager for the Note model that uses:
      - CTEManager (from_queryset)
      - NoteQuerySet (with permission checks, optional vector search, etc.)
    """

    def get_queryset(self) -> NoteQuerySet:
        return NoteQuerySet(self.model, using=self._db)

    def for_user(
        self, user: User, perm: str, extra_conditions: Optional[Q] = None
    ) -> NoteQuerySet:
        """
        Filters the queryset based on user permissions.
        """
        return self.get_queryset().for_user(user, perm, extra_conditions)

    def search_by_embedding(self, query_vector, embedder_path, top_k=10):
        """
        If using VectorSearchViaEmbeddingMixin in your NoteQuerySet,
        you can call:
            Note.objects.search_by_embedding([0.1, 0.2, ...], "xx-embedder", top_k=10)
        """
        return self.get_queryset().search_by_embedding(
            query_vector, embedder_path, top_k
        )


class EmbeddingManager(PermissionManager):
    """
    Manager for Embedding that can store or update embeddings
    without creating accidental duplicates for the same dimension,
    embedder_path, and parent references (document/annotation/note).
    """

    def _get_vector_field_name(self, dimension: int) -> str:
        if dimension == 384:
            return "vector_384"
        elif dimension == 768:
            return "vector_768"
        elif dimension == 1536:
            return "vector_1536"
        elif dimension == 3072:
            return "vector_3072"
        raise ValueError(f"Unsupported embedding dimension: {dimension}")

    def store_embedding(
        self,
        *,
        creator: User,
        dimension: int,
        vector: list[float],
        embedder_path: str,
        document_id: Optional[int] = None,
        annotation_id: Optional[int] = None,
        note_id: Optional[int] = None,
    ):
        """
        Create or update an Embedding, referencing exactly one of Document, Annotation, or Note.
        If an Embedding already exists for (embedder_path + parent_id), update its vector field
        instead of creating a new record.
        """
        if not any([document_id, annotation_id, note_id]):
            raise ValueError(
                "Must provide one of document_id, annotation_id, or note_id."
            )

        field_name = self._get_vector_field_name(dimension)

        # Find existing embedding (if any)
        embedding = (
            self.visible_to_user(user=creator)
            .filter(
                embedder_path=embedder_path,
                document_id=document_id,
                annotation_id=annotation_id,
                note_id=note_id,
            )
            .first()
        )

        if embedding:
            setattr(embedding, field_name, vector)
            embedding.save()
            return embedding

        # Create a new embedding if none found
        return self.create(
            creator=creator,
            embedder_path=embedder_path,
            document_id=document_id,
            annotation_id=annotation_id,
            note_id=note_id,
            **{field_name: vector},
        )
