import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from config.graphql_api_token_auth.utils import get_authorization_header

UserModel = get_user_model()
logger = logging.getLogger(__name__)


class Auth0ApiKeyBackend:

    model = None

    def get_model(self):
        logger.debug("Getting token model")
        if self.model is not None:
            return self.model

        from rest_framework.authtoken.models import Token

        logger.debug("Using default Token model")
        return Token

    """
    A custom token model may be used, but must have the following properties.
    * key -- The string identifying the token
    * user -- The user to which the token belongs
    """

    def authenticate(self, request=None, **kwargs):
        logger.debug("Starting authentication process")

        if request is None:
            logger.debug("No request provided, returning None")
            return None

        auth = get_authorization_header(request).split()
        logger.debug(f"Authorization header: {auth}")

        if not auth or auth[0].lower() != settings.API_TOKEN_PREFIX.lower().encode():
            logger.debug("Invalid or missing auth prefix")
            return None

        if len(auth) == 1:
            msg = _("Invalid token header. No credentials provided.")
            logger.warning("Authentication failed: No credentials provided")
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = _("Invalid token header. Token string should not contain spaces.")
            logger.warning("Authentication failed: Token contains spaces")
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
            logger.debug("Successfully decoded token")
        except UnicodeError:
            msg = _(
                "Invalid token header. Token string should not contain invalid characters."
            )
            logger.warning("Authentication failed: Invalid token characters")
            raise exceptions.AuthenticationFailed(msg)

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, key):
        logger.debug("Authenticating credentials")
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
            logger.debug(f"Found token for user: {token.user.username}")
        except model.DoesNotExist:
            logger.warning(f"Authentication failed: Invalid token {key[:8]}...")
            raise exceptions.AuthenticationFailed(_("Invalid token."))

        if not token.user.is_active:
            logger.warning(
                f"Authentication failed: Inactive user {token.user.username}"
            )
            raise exceptions.AuthenticationFailed(_("User inactive or deleted."))

        logger.debug(f"Successfully authenticated user: {token.user.username}")
        return token.user

    def authenticate_header(self, request):
        logger.debug("Getting authentication header")
        return self.keyword
