"""
JWT Authentication for Django REST Framework.

Uses the unified jwt_utils module for token validation, ensuring consistent
authentication behavior across REST, GraphQL, and WebSocket API surfaces.
"""

import logging

from rest_framework import authentication, exceptions

from config.jwt_utils import get_user_from_jwt_token

logger = logging.getLogger(__name__)


class GraphQLJWTAuthentication(authentication.BaseAuthentication):
    """
    DRF authentication class that validates JWT tokens.

    Supports both standard JWT tokens (graphql_jwt) and Auth0 tokens when
    USE_AUTH0 is enabled. Uses the unified jwt_utils module for validation,
    ensuring the same authentication logic as GraphQL and WebSocket APIs.

    Token format: Authorization: Bearer <token> (or Authorization: JWT <token>)
    """

    keyword = "Bearer"

    def authenticate(self, request):
        """
        Authenticate the request and return a tuple of (user, token) or None.

        Returns None if no JWT token is present (allowing other authenticators to try).
        Raises AuthenticationFailed if the token is present but invalid.
        """
        auth_header = authentication.get_authorization_header(request).decode("utf-8")

        if not auth_header:
            return None

        parts = auth_header.split()

        if len(parts) == 0:
            return None

        # Support both "JWT <token>" and "Bearer <token>" formats
        if parts[0].upper() not in ("JWT", "BEARER"):
            return None

        if len(parts) == 1:
            raise exceptions.AuthenticationFailed(
                "Invalid token header. No token provided."
            )

        if len(parts) > 2:
            raise exceptions.AuthenticationFailed(
                "Invalid token header. Token should not contain spaces."
            )

        token = parts[1]
        return self._authenticate_token(token)

    def _authenticate_token(self, token: str):
        """
        Validate the JWT token and return (user, token).

        Uses the unified jwt_utils.get_user_from_jwt_token() which automatically
        handles both Auth0 and standard graphql_jwt tokens.
        """
        from config.jwt_auth.exceptions import JSONWebTokenError, JSONWebTokenExpired

        try:
            user = get_user_from_jwt_token(token)
            return (user, token)

        except JSONWebTokenExpired:
            raise exceptions.AuthenticationFailed("Token has expired")

        except JSONWebTokenError as e:
            # Security: Log detailed error server-side but return generic message
            # to prevent information disclosure to potential attackers
            logger.warning(f"JWT validation failed: {e}")
            raise exceptions.AuthenticationFailed("Invalid token")

        except Exception as e:
            # Security: Log detailed error server-side but return generic message
            # to prevent information disclosure to potential attackers
            logger.error(f"JWT authentication error: {e}")
            raise exceptions.AuthenticationFailed("Authentication error")

    def authenticate_header(self, request):
        """
        Return the WWW-Authenticate header value for 401 responses.
        """
        return self.keyword
