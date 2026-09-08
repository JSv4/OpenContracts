"""JWT claims, signing, validation, and credential extraction.

The claim names, coercion, and error messages preserve tokens issued before
the Strawberry migration. PyJWT remains responsible for cryptography.
"""

from datetime import datetime, timezone

import jwt
from django.contrib.auth import get_user_model
from django.utils.translation import gettext as _

from .exceptions import JSONWebTokenError, JSONWebTokenExpired
from .settings import jwt_settings


def jwt_payload(user, context=None):
    username = user.get_username()
    username = getattr(username, "pk", username)
    now = datetime.now(timezone.utc)
    payload = {
        user.USERNAME_FIELD: username,
        "exp": int((now + jwt_settings.JWT_EXPIRATION_DELTA).timestamp()),
    }
    if jwt_settings.JWT_ALLOW_REFRESH:
        payload["origIat"] = int(now.timestamp())
    if jwt_settings.JWT_AUDIENCE is not None:
        payload["aud"] = jwt_settings.JWT_AUDIENCE
    if jwt_settings.JWT_ISSUER is not None:
        payload["iss"] = jwt_settings.JWT_ISSUER
    return payload


def jwt_encode(payload, context=None):
    return jwt.encode(
        payload,
        jwt_settings.JWT_PRIVATE_KEY or jwt_settings.JWT_SECRET_KEY,
        algorithm=jwt_settings.JWT_ALGORITHM,
    )


def jwt_decode(token, context=None):
    return jwt.decode(
        token,
        jwt_settings.JWT_PUBLIC_KEY or jwt_settings.JWT_SECRET_KEY,
        algorithms=[jwt_settings.JWT_ALGORITHM],
        options={
            "verify_exp": jwt_settings.JWT_VERIFY_EXPIRATION,
            "verify_aud": jwt_settings.JWT_AUDIENCE is not None,
            "verify_signature": jwt_settings.JWT_VERIFY,
        },
        leeway=jwt_settings.JWT_LEEWAY,
        audience=jwt_settings.JWT_AUDIENCE,
        issuer=jwt_settings.JWT_ISSUER,
    )


def get_http_authorization(request):
    parts = request.META.get(jwt_settings.JWT_AUTH_HEADER_NAME, "").split()
    if (
        len(parts) == 2
        and parts[0].lower() == jwt_settings.JWT_AUTH_HEADER_PREFIX.lower()
    ):
        return parts[1]
    return request.COOKIES.get(jwt_settings.JWT_COOKIE_NAME)


def get_token_argument(request, **kwargs):
    if not jwt_settings.JWT_ALLOW_ARGUMENT:
        return None
    fields = kwargs.get("input")
    if isinstance(fields, dict):
        kwargs = fields
    return kwargs.get(jwt_settings.JWT_ARGUMENT_NAME)


def get_credentials(request, **kwargs):
    return get_token_argument(request, **kwargs) or get_http_authorization(request)


def get_payload(token, context=None):
    try:
        return jwt_settings.JWT_DECODE_HANDLER(token, context)
    except jwt.ExpiredSignatureError as exc:
        raise JSONWebTokenExpired() from exc
    except jwt.DecodeError as exc:
        raise JSONWebTokenError(_("Error decoding signature")) from exc
    except jwt.InvalidTokenError as exc:
        raise JSONWebTokenError(_("Invalid token")) from exc


def get_user_by_natural_key(username):
    model = get_user_model()
    try:
        return model._default_manager.get_by_natural_key(username)
    except model.DoesNotExist:
        return None


def get_user_by_payload(payload):
    username = jwt_settings.JWT_PAYLOAD_GET_USERNAME_HANDLER(payload)
    if not username:
        raise JSONWebTokenError(_("Invalid payload"))
    user = jwt_settings.JWT_GET_USER_BY_NATURAL_KEY_HANDLER(username)
    if user is not None and not getattr(user, "is_active", True):
        raise JSONWebTokenError(_("User is disabled"))
    return user


def refresh_has_expired(orig_iat, context=None):
    return int(datetime.now(timezone.utc).timestamp()) > refresh_expires_in(orig_iat)


def refresh_expires_in(orig_iat=None):
    issued_at = (
        int(datetime.now(timezone.utc).timestamp()) if orig_iat is None else orig_iat
    )
    return issued_at + jwt_settings.JWT_REFRESH_EXPIRATION_DELTA.total_seconds()
