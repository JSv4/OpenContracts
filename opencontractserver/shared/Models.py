import django
from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone


class BaseOCModel(models.Model):
    """
    Base model for all OpenContracts models that has some properties it's nice to have on
    all models.
    """

    class Meta:
        abstract = True

    # Processing fields
    # user_lock should be set when long-running process is activated for a given model by a user
    # and unset when process is done.
    user_lock = django.db.models.ForeignKey(
        get_user_model(),
        on_delete=django.db.models.SET_NULL,
        null=True,
        blank=True,
        related_name="locked_%(class)s_objects",
    )

    # This should be set to true if a long-running job is set on a model (e.g. change permissions or delete)
    backend_lock = django.db.models.BooleanField(default=False)

    # Sharing
    is_public = django.db.models.BooleanField(default=False)
    creator = django.db.models.ForeignKey(
        get_user_model(), on_delete=django.db.models.CASCADE, null=False, blank=False
    )

    # Timing variables
    created = django.db.models.DateTimeField(auto_now_add=True, blank=False, null=False)
    modified = django.db.models.DateTimeField(auto_now=True, blank=False, null=False)

    # Override save to update modified on save
    def save(self, *args, **kwargs):
        """On save, update timestamps"""
        if not self.pk:
            self.created = timezone.now()
        self.modified = timezone.now()

        return super().save(*args, **kwargs)
