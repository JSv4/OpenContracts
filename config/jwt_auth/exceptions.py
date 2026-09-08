"""Authentication errors whose messages are part of the public API."""

from django.utils.functional import Promise
from django.utils.translation import gettext_lazy as _


class JSONWebTokenError(Exception):
    default_message: str | Promise | None = None

    def __init__(self, message=None):
        super().__init__(self.default_message if message is None else message)


class JSONWebTokenExpired(JSONWebTokenError):
    default_message = _("Signature has expired")


class PermissionDenied(JSONWebTokenError):
    default_message = _("You do not have permission to perform this action")
