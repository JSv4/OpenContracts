from django.utils.functional import lazy

from config.jwt_auth.exceptions import JSONWebTokenError
from config.jwt_auth.settings import jwt_settings

from .utils import get_refresh_token_model


def get_refresh_token(token, context=None):
    model = get_refresh_token_model()
    try:
        return jwt_settings.JWT_GET_REFRESH_TOKEN_HANDLER(
            refresh_token_model=model, token=token, context=context
        )
    except model.DoesNotExist as exc:
        raise JSONWebTokenError("Invalid refresh token") from exc


def create_refresh_token(user, refresh_token=None):
    if refresh_token is not None and jwt_settings.JWT_REUSE_REFRESH_TOKENS:
        refresh_token.reuse()
        return refresh_token
    return get_refresh_token_model().objects.create(user=user)


def _issue_refresh_token(user, refresh_token=None):
    return create_refresh_token(user, refresh_token).get_token()


# A tokenAuth operation that selects only `token` must not create a refresh
# record (or require the optional model to be installed).
refresh_token_lazy = lazy(_issue_refresh_token, str)
