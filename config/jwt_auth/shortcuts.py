"""Token issuance and user lookup for all API transports."""

from .settings import jwt_settings
from .utils import get_payload, get_user_by_payload


def get_token(user, context=None, **extra):
    payload = jwt_settings.JWT_PAYLOAD_HANDLER(user, context)
    payload.update(extra)
    return jwt_settings.JWT_ENCODE_HANDLER(payload, context)


def get_user_by_token(token, context=None):
    return get_user_by_payload(get_payload(token, context))
