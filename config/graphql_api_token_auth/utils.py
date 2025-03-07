import logging

from django.conf import settings
from rest_framework import HTTP_HEADER_ENCODING

logger = logging.getLogger(__name__)


def get_authorization_header(request):
    """
    Return request's 'Authorization:' header, as a bytestring.
    Hide some test client ickyness where the header can be unicode.
    """
    auth = request.META.get("HTTP_AUTHORIZATION", b"")
    if isinstance(auth, str):
        # Work around django test client oddness
        auth = auth.encode(HTTP_HEADER_ENCODING)
    return auth


def get_token_argument(request, **kwargs):
    auth = request.headers.get(settings.API_TOKEN_HEADER_NAME)
    if auth:
        parts = auth.split()
        if len(parts) == 2 and parts[0].lower() == settings.API_TOKEN_PREFIX.lower():
            return parts[1]
    return None


def get_http_authorization(request):
    """
    Extract and validate the HTTP authorization token from the request.
    Returns the token if valid, None otherwise.
    """
    logger.info("Attempting to get HTTP authorization")

    auth = request.META.get("HTTP_" + settings.API_TOKEN_HEADER_NAME, "").split()
    prefix = settings.API_TOKEN_PREFIX

    logger.debug(f"Authorization header parts: {auth}")
    logger.debug(f"Expected prefix: {prefix}")

    if len(auth) != 2 or auth[0].lower() != prefix.lower():
        logger.warning(
            f"Invalid authorization format - got {len(auth)} parts with prefix '{auth[0] if auth else None}'"
        )
        return None

    token = auth[1]
    logger.debug(f"Successfully extracted token: {token[:8]}...")
    return token
