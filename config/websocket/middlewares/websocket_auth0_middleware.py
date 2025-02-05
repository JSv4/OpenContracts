"""
WebsocketAuth0TokenMiddleware provides a DRY approach to authenticating a WebSocket
connection using the same logic as our ApiKeyTokenMiddleware for GraphQL HTTP requests.

Instead of using GraphQL JWT tokens (as in GraphQLJWTTokenAuthMiddleware), it:
1. Examines the token provided in the WebSocket's query string or headers.
2. Constructs a minimal Django-style request object to reuse the existing authenticate()
   logic from ApiKeyBackend.
3. Sets an authenticated user on the scope if valid, otherwise AnonymousUser.

Usage:
    Add it to your Channels routing as a middleware:
        from config.websocket.auth0_middleware import WebsocketAuth0TokenMiddleware
        application = ProtocolTypeRouter({
            "websocket": AuthMiddlewareStack(
                WebsocketAuth0TokenMiddleware(
                    URLRouter(
                        # your websocket routes
                    )
                )
            ),
        })

Dependencies:
    - Django / Channels / DRF
    - config.graphql_api_token_auth.backends.ApiKeyBackend
    - config.graphql_api_token_auth.utils (optional for advanced token/headers logic)
"""

import logging
from typing import Any
from urllib.parse import parse_qsl

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

from django.contrib.auth import get_user_model


from config.graphql_auth0_auth.utils import get_user_by_token

logger = logging.getLogger(__name__)

User = get_user_model()


class WebsocketAuth0TokenMiddleware(BaseMiddleware):
    """
    Middleware that authenticates a user connecting via WebSocket using the same
    logic as our ApiKeyTokenMiddleware, but applied to the WebSocket scope.

    Steps:
        1. Look for a token in the query string or via the 'Authorization' header in scope.
        2. Build a minimal Django-style HttpRequest object.
        3. Call `authenticate()` which reuses the ApiKeyBackend.
        4. Set `scope["user"]` to the authenticated user or AnonymousUser.
    """

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> Any:
        scope["user"] = AnonymousUser()  # Default to AnonymousUser

        # 1. Extract the token from query string or scope headers
        query_string = scope.get("query_string", b"").decode("utf-8")
        logger.info(f"Query string: {query_string}")
        query_params = dict(parse_qsl(query_string))
        token = query_params.get("token")
        logger.info(f"Extracted query string parameters: {query_params}")
        logger.info(f"Found token in query string: {'Yes' if token else 'No'}")

        # Also allow a standard 'Authorization' header (for example "Authorization: Bearer abc123")
        # scope["headers"] is a list of tuples of the form [(b'header-name', b'value'), ...]
        headers = scope.get("headers", [])

        # 2. If we found a token or relevant header, try to authenticate
        if token or any(h[0].lower() == b"authorization" for h in headers):
            logger.debug("Attempting authentication with provided credentials")
            try:
                logger.info(f"WebsocketAuth0TokenMiddleware - Attempting authentication with token: {token}")
                user = await database_sync_to_async(get_user_by_token)(token)
                logger.info(f"WebsocketAuth0TokenMiddleware - user: {user}")
                if user and isinstance(user, User):
                    logger.info(f"Websocket user authenticated: {user.username}")
                    logger.info(
                        f"Successfully authenticated user {user.username} with ID {user.id}"
                    )
                    scope["user"] = user
                else:
                    logger.warning(
                        "Websocket token authentication failed, using AnonymousUser"
                    )
                    logger.debug("Authentication attempt returned no valid user")

            except Exception as e:
                logger.error(f"Error during Websocket auth: {e}", exc_info=True)
                logger.debug("Authentication attempt failed with exception")

        # Log final authentication state
        logger.debug(
            f"WS authentication complete - User: {scope['user']}, "
            f"Authenticated: {scope['user'].is_authenticated}"
        )

        return await super().__call__(scope, receive, send)
