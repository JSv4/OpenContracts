from django.contrib.auth.validators import UnicodeUsernameValidator
from django.utils.translation import gettext_lazy as _


class UserUnicodeUsernameValidator(UnicodeUsernameValidator):
    r"""Allows \."""

    regex = r"^[\w.@|*+-\\]+$"
    message = _(
        "Enter a valid username. This value may contain only letters, "
        r"numbers, and |*\/@/./+/-/_ characters."
    )
