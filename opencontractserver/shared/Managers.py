from django.db import models
from django.db.models import Q

from opencontractserver.shared.QuerySets import UserFeedbackQuerySet


class UserFeedbackManager(models.Manager):
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

    def visible_to_user(self, user):
        return self.get_queryset().visible_to_user(user)
