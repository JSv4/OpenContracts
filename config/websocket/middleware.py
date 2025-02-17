import logging
from typing import Any, Union
from urllib.parse import parse_qsl

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser, User
from graphql_jwt.exceptions import JSONWebTokenError

logger = logging.getLogger(__name__)


@database_sync_to_async
def get_user_from_token(token: str) -> Union[User, AnonymousUser]:
    """
    Retrieves and returns a User object if the provided JWT token is valid.
    If the token is invalid or the user cannot be retrieved, returns AnonymousUser.

    :param token: The JWT token extracted from the query string.
    :return: User or AnonymousUser
    :raises JSONWebTokenError: When token is invalid or expired.
    """
    from graphql_jwt.utils import get_payload, get_user_by_payload

    try:
        logger.debug(f"Attempting to validate token: {token} ...")
        payload = get_payload(token)
        logger.debug(f"Token payload retrieved: {payload}")

        user = get_user_by_payload(payload)
        if user is None:
            logger.error("User not found from token payload")
            return AnonymousUser()

        logger.info(f"Successfully authenticated user: {user.username}")
        return user

    except JSONWebTokenError as jwt_err:
        logger.error(f"JWT Token validation failed: {jwt_err}")
        return AnonymousUser()
    except Exception as e:
        logger.error(
            f"Unexpected error during token authentication: {str(e)}", exc_info=True
        )
        return AnonymousUser()


class GraphQLJWTTokenAuthMiddleware(BaseMiddleware):
    """
    Custom middleware that takes a JWT token from the query string, validates it,
    and sets the associated user in scope['user']. If no token is provided or
    it is invalid, scope['user'] is set to AnonymousUser.
    """

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> Any:
        """
        Extracts the 'token' from the query string and authenticates the user.
        If token is missing or invalid, an AnonymousUser is assigned to scope['user'].

        :param scope: The ASGI scope dictionary, including query_string.
        :param receive: The receive callable provided by Channels.
        :param send: The send callable provided by Channels.
        :return: The result of the next layer in the application.
        """
        # Initialize with AnonymousUser
        scope["user"] = AnonymousUser()

        try:
            # Parse query string
            query_string = scope.get("query_string", b"").decode("utf-8")
            query_params = dict(parse_qsl(query_string))

            # Extract token
            token = query_params.get("token")

            if not token:
                logger.warning("No token provided in WebSocket connection")
            else:
                logger.info(
                    "Token found in query parameters, attempting authentication"
                )
                user = await get_user_from_token(token)
                scope["user"] = user

                if isinstance(user, AnonymousUser):
                    logger.warning("Token authentication failed, using AnonymousUser")
                else:
                    logger.info(f"Successfully authenticated user: {user.username}")

        except Exception as e:
            logger.error(f"Error in auth middleware: {str(e)}", exc_info=True)
            scope["user"] = AnonymousUser()

        # Log final authentication state
        logger.info(
            f"Authentication complete - User: {scope['user']}, "
            f"Authenticated: {scope['user'].is_authenticated}"
        )

        return await super().__call__(scope, receive, send)
