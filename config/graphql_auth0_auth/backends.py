import logging

import graphql_jwt
from django.contrib.auth import get_user_model

from config.graphql_auth0_auth.utils import get_user_by_token

UserModel = get_user_model()
logger = logging.getLogger(__name__)


class Auth0RemoteUserJSONWebTokenBackend:
    def authenticate(self, request=None, **kwargs):
        logger.debug(
            f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - Starting with request: {request}"
        )
        logger.debug(
            f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - kwargs: {kwargs}"
        )

        if request is None or getattr(request, "_jwt_token_auth", False):
            logger.debug(
                "Auth0RemoteUserJSONWebTokenBackend.authenticate() - request is None or _jwt_token_auth is True, returning None"  # noqa: E501
            )
            return None

        token = graphql_jwt.utils.get_credentials(request, **kwargs)
        logger.debug(
            f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - token retrieved: {'Present' if token else 'None'}"
        )
        if token:
            logger.debug(
                f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - token first 10 chars: {token[:10]}"
            )

        if token is not None:
            try:
                user = get_user_by_token(token)
                logger.debug(
                    f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - User from token: {user}, id: {user.id if user else 'None'}"  # noqa: E501
                )
                return user
            except Exception as e:
                logger.error(
                    f"Auth0RemoteUserJSONWebTokenBackend.authenticate() - Error getting user by token: {str(e)}"
                )
                return None

        logger.debug(
            "Auth0RemoteUserJSONWebTokenBackend.authenticate() - No token found, returning None"
        )
        return None

    def get_user(self, user_id):
        logger.debug(
            f"Auth0RemoteUserJSONWebTokenBackend.get_user() - Looking up user_id: {user_id}"
        )
        try:
            user = UserModel._default_manager.get(pk=user_id)
            logger.debug(
                f"Auth0RemoteUserJSONWebTokenBackend.get_user() - Found user: {user}, is_active: {user.is_active}"
            )
            return user
        except UserModel.DoesNotExist:
            logger.warning(
                f"Auth0RemoteUserJSONWebTokenBackend.get_user() - User with id {user_id} does not exist"
            )
            return None
        except Exception as e:
            logger.error(
                f"Auth0RemoteUserJSONWebTokenBackend.get_user() - Error getting user: {str(e)}"
            )
            return None
