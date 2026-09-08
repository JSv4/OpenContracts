"""Keep the deployed GRAPHQL_JWT configuration while owning its runtime."""

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.module_loading import import_string

DEFAULTS = {
    "JWT_ALGORITHM": "HS256",
    "JWT_AUDIENCE": None,
    "JWT_ISSUER": None,
    "JWT_LEEWAY": 0,
    "JWT_PUBLIC_KEY": None,
    "JWT_PRIVATE_KEY": None,
    "JWT_VERIFY": True,
    "JWT_VERIFY_EXPIRATION": False,
    "JWT_EXPIRATION_DELTA": timedelta(minutes=5),
    "JWT_ALLOW_REFRESH": True,
    "JWT_REFRESH_EXPIRATION_DELTA": timedelta(days=7),
    "JWT_LONG_RUNNING_REFRESH_TOKEN": False,
    "JWT_REFRESH_TOKEN_MODEL": "refresh_token.RefreshToken",
    "JWT_REFRESH_TOKEN_N_BYTES": 20,
    "JWT_REUSE_REFRESH_TOKENS": False,
    "JWT_AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "JWT_AUTH_HEADER_PREFIX": "JWT",
    "JWT_ALLOW_ARGUMENT": False,
    "JWT_ARGUMENT_NAME": "token",
    "JWT_ENCODE_HANDLER": "config.jwt_auth.utils.jwt_encode",
    "JWT_DECODE_HANDLER": "config.jwt_auth.utils.jwt_decode",
    "JWT_PAYLOAD_HANDLER": "config.jwt_auth.utils.jwt_payload",
    "JWT_PAYLOAD_GET_USERNAME_HANDLER": (
        lambda payload: payload.get(get_user_model().USERNAME_FIELD)
    ),
    "JWT_GET_USER_BY_NATURAL_KEY_HANDLER": "config.jwt_auth.utils.get_user_by_natural_key",
    "JWT_REFRESH_EXPIRED_HANDLER": "config.jwt_auth.utils.refresh_has_expired",
    "JWT_GET_REFRESH_TOKEN_HANDLER": (
        "config.jwt_auth.refresh_token.utils.get_refresh_token_by_model"
    ),
    "JWT_CSRF_ROTATION": False,
    "JWT_COOKIE_NAME": "JWT",
    "JWT_REFRESH_TOKEN_COOKIE_NAME": "JWT-refresh-token",
}


class JWTSettings:
    def __getattr__(self, name: str) -> Any:
        if name == "JWT_SECRET_KEY":
            default = settings.SECRET_KEY
        elif name in DEFAULTS:
            default = DEFAULTS[name]
        else:
            raise AttributeError(f"Invalid setting: `{name}`")
        value = getattr(settings, "GRAPHQL_JWT", {}).get(name, default)
        if name.endswith("_HANDLER") and isinstance(value, str):
            # Existing deployments may explicitly configure the old default
            # handler paths. Resolve those to the framework-free replacements.
            if value.startswith("graphql_jwt."):
                value = value.replace("graphql_jwt.", "config.jwt_auth.", 1)
            return import_string(value)
        return value


# Read settings on access so override_settings and signing-key changes cannot
# leave a stale cached secret or handler behind.
jwt_settings = JWTSettings()
