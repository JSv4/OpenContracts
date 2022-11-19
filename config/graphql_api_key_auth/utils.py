from django.conf import settings
from rest_framework import HTTP_HEADER_ENCODING


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
    return request.headers.get(settings.API_TOKEN_HEADER_NAME)


def get_http_authorization(request):

    auth = request.META.get("HTTP_" + settings.API_TOKEN_HEADER_NAME, "").split()
    prefix = settings.API_TOKEN_PREFIX

    if len(auth) != 2 or auth[0].lower() != prefix.lower():
        return None

    return auth[1]
