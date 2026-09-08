"""Optional refresh-token storage with the existing database layout."""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from config.jwt_auth.settings import jwt_settings

from . import signals


class RefreshTokenQuerySet(models.QuerySet):
    def expired(self):
        cutoff = timezone.now() - jwt_settings.JWT_REFRESH_EXPIRATION_DELTA
        return self.annotate(
            expired=models.Case(
                models.When(created__lt=cutoff, then=models.Value(True)),
                default=models.Value(False),
                output_field=models.BooleanField(),
            )
        )


class AbstractRefreshToken(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
        verbose_name="user",
    )
    token = models.CharField("token", max_length=255, editable=False)
    created = models.DateTimeField("created", auto_now_add=True)
    revoked = models.DateTimeField("revoked", null=True, blank=True)
    objects = RefreshTokenQuerySet.as_manager()

    class Meta:
        abstract = True
        verbose_name = "refresh token"
        verbose_name_plural = "refresh tokens"
        unique_together = ("token", "revoked")

    def __str__(self):
        return self.token

    def generate_token(self):
        return secrets.token_hex(jwt_settings.JWT_REFRESH_TOKEN_N_BYTES)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self._cached_token = self.generate_token()
        super().save(*args, **kwargs)

    def get_token(self):
        return getattr(self, "_cached_token", self.token)

    def is_expired(self, request=None):
        return jwt_settings.JWT_REFRESH_EXPIRED_HANDLER(
            int(self.created.timestamp()), request
        )

    def revoke(self, request=None):
        self.revoked = timezone.now()
        self.save(update_fields=["revoked"])
        signals.refresh_token_revoked.send(
            sender=AbstractRefreshToken, request=request, refresh_token=self
        )

    def reuse(self, request=None):
        self.token = ""
        self.created = timezone.now()
        self.save(update_fields=["token", "created"])


class RefreshToken(AbstractRefreshToken):
    """Default model, enabled only when this app is in INSTALLED_APPS."""
