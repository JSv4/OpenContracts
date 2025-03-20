import json
import logging
import uuid

import jwt
import requests
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.translation import gettext as _
from graphql_jwt import exceptions

from config.graphql_auth0_auth.settings import auth0_settings
from opencontractserver.users.tasks import sync_remote_user

logger = logging.getLogger(__name__)


def jwt_auth0_decode(token):
    logger.debug(f"jwt_auth0_decode() - Attempting to decode token, first 10 chars: {token[:10]}...")
    try:
        header = jwt.get_unverified_header(token)
        logger.debug(f"jwt_auth0_decode() - Header: {header}")
        jwks = requests.get(
            f"https://{auth0_settings.AUTH0_DOMAIN}/.well-known/jwks.json"
        ).json()
        logger.debug(f"jwt_auth0_decode() - Retrieved JWKS with {len(jwks.get('keys', []))} keys")
        public_key = None
        for jwk in jwks["keys"]:
            logger.debug(f"jwt_auth0_decode() - Checking JWK kid: {jwk['kid']} against header kid: {header['kid']}")
            if jwk["kid"] == header["kid"]:
                logger.debug(f"jwt_auth0_decode() - Found matching kid: {jwk['kid']}")
                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
                break

        if public_key is None:
            logger.error("jwt_auth0_decode() - Public key not found - no matching kid in JWKS")
            raise Exception("Public key not found.")

        issuer = f"https://{auth0_settings.AUTH0_DOMAIN}/"
        logger.debug(f"jwt_auth0_decode() - Issuer: {issuer}")
        logger.debug(f"jwt_auth0_decode() - API Audience: {auth0_settings.AUTH0_API_AUDIENCE}")
        logger.debug(f"jwt_auth0_decode() - Algorithm: {auth0_settings.AUTH0_TOKEN_ALGORITHM}")
        
        decoded = jwt.decode(
            token,
            public_key,
            audience=auth0_settings.AUTH0_API_AUDIENCE,
            issuer=issuer,
            algorithms=[auth0_settings.AUTH0_TOKEN_ALGORITHM],
        )
        logger.debug(f"jwt_auth0_decode() - Successfully decoded token with keys: {list(decoded.keys())}")
        return decoded
    except Exception as e:
        logger.error(f"jwt_auth0_decode() - Error decoding token: {str(e)}")
        raise


def get_payload(token):
    logger.debug(f"get_payload() - Processing token, first 10 chars: {token[:10] if token else 'None'}...")
    try:
        payload = auth0_settings.AUTH0_DECODE_HANDLER(token)
        logger.debug(f"get_payload() - Successfully got payload with keys: {list(payload.keys())}")
        return payload
    except jwt.ExpiredSignatureError as e:
        logger.error(f"get_payload() - Token expired: {str(e)}")
        raise exceptions.JSONWebTokenExpired()
    except jwt.DecodeError as e:
        logger.error(f"get_payload() - Decode error: {str(e)}")
        raise exceptions.JSONWebTokenError(_("Error decoding signature"))
    except jwt.InvalidTokenError as e:
        logger.error(f"get_payload() - Invalid token error: {str(e)}")
        raise exceptions.JSONWebTokenError(_("Invalid token"))
    except Exception as e:
        logger.error(f"get_payload() - Unexpected error: {str(e)}")
        raise


def user_can_authenticate(user):
    """
    Reject users with is_active=False. Custom user models that don't have
    that attribute are allowed.
    """
    is_active = getattr(user, "is_active", None)
    logger.debug(f"user_can_authenticate() - User: {user}, is_active: {is_active}")
    return is_active or is_active is None


def configure_user(user):
    """
    Configure a user after creation and return the updated user.
    Also triggers async task to sync user data with auth0 profile.
    """
    logger.debug(f"configure_user() - Configuring new user: {user}")
    user.is_active = True
    user.set_password(
        uuid.uuid4().__str__()
    )  # Random django password to prevent malicious use of user with no pass
    user.first_signed_in = timezone.now()
    user.save()
    logger.debug(f"configure_user() - User configured and saved: {user}, is_active: {user.is_active}")

    # For new users from outside
    logger.debug(f"configure_user() - Triggering async sync for user: {user.username}")
    sync_remote_user.delay(
        user.username
    )  # This is run async, but I'm not sure we want this actually...

    return user


def get_auth0_user_from_token(remote_username):
    logger.debug(f"get_auth0_user_from_token() - Starting with remote_username: {remote_username}")

    if not remote_username:
        logger.warning("get_auth0_user_from_token() - No remote username provided")
        return
    user = None

    UserModel = get_user_model()
    logger.debug(f"get_auth0_user_from_token() - UserModel: {UserModel}")
    logger.debug(f"get_auth0_user_from_token() - remote_username: {remote_username}")
    logger.debug(
        f"get_auth0_user_from_token() - AUTH0_CREATE_NEW_USERS: {auth0_settings.AUTH0_CREATE_NEW_USERS}"
    )

    if auth0_settings.AUTH0_CREATE_NEW_USERS:
        logger.debug(f"get_auth0_user_from_token() - Attempting to get_or_create user with username: {remote_username}")
        try:
            user, created = UserModel._default_manager.get_or_create(
                **{UserModel.USERNAME_FIELD: remote_username}
            )
            logger.debug(f"get_auth0_user_from_token() - user created: {created}")
            logger.debug(f"get_auth0_user_from_token() - user: {user}, id: {user.id if user else 'None'}")
            if created:
                logger.debug(f"get_auth0_user_from_token() - configuring new user: {user}")
                user = configure_user(user)
                logger.debug(f"get_auth0_user_from_token() - user configured: {user}, is_active: {user.is_active if user else 'None'}")
        except Exception as e:
            logger.error(f"get_auth0_user_from_token() - Error in get_or_create: {str(e)}")
    else:
        try:
            logger.debug(f"get_auth0_user_from_token() - Attempting to get user by natural key: {remote_username}")
            user = UserModel._default_manager.get_by_natural_key(remote_username)
            logger.debug(f"get_auth0_user_from_token() - found existing user: {user}, id: {user.id if user else 'None'}")
        except UserModel.DoesNotExist:
            logger.warning(f"get_auth0_user_from_token() - User with username {remote_username} does not exist")
            pass
        except Exception as e:
            logger.error(f"get_auth0_user_from_token() - Error getting user by natural key: {str(e)}")

    if user is None:
        logger.warning(
            "get_auth0_user_from_token() - returning None as no user found/created"
        )
        return user
    else:
        is_active = user.is_active and user_can_authenticate(user)
        logger.debug(f"get_auth0_user_from_token() - user {user.username} active status: {is_active}")
        if not is_active:
            logger.warning(f"get_auth0_user_from_token() - User {user.username} is not active, returning None")
        return user if is_active else None


def jwt_get_username_from_payload_handler(payload):
    username = payload.get("sub")
    logger.debug(f"jwt_get_username_from_payload_handler() - Extracted username from payload: {username}")
    return username


def get_user_by_payload(payload):
    logger.debug(f"get_user_by_payload() - Payload keys: {list(payload.keys())}")
    
    username = jwt_get_username_from_payload_handler(payload)
    logger.debug(f"get_user_by_payload() - Extracted username: {username}")

    if not username:
        logger.error("get_user_by_payload() - No username in payload")
        raise exceptions.JSONWebTokenError(_("Invalid payload"))

    logger.debug(f"get_user_by_payload() - Getting user from token handler with username: {username}")
    user = auth0_settings.AUTH0_GET_USER_FROM_TOKEN_HANDLER(username)
    logger.debug(f"get_user_by_payload() - User returned from handler: {user}, id: {user.id if user else 'None'}")

    if user is not None:
        is_active = getattr(user, "is_active", True)
        logger.debug(f"get_user_by_payload() - User {user.username} is_active: {is_active}")
        if not is_active:
            logger.error(f"get_user_by_payload() - User {user.username} is disabled")
            raise exceptions.JSONWebTokenError(_("User is disabled"))
    else:
        logger.warning("get_user_by_payload() - No user found for username")

    logger.debug(f"get_user_by_payload() - returning user: {user}, id: {user.id if user else 'None'}")
    return user


def get_user_by_token(token, **kwargs):
    """
    Given a JWT token from auth0, verify the token. If valid,
    1) check if matching user exists and return obj or, 2), if no
    user exists and settings is set to create user obj for unknown user,
    create a user, configure it, and return user obj
    """
    logger.debug(f"get_user_by_token() - Starting with token first 10 chars: {token[:10] if token else 'None'}...")
    try:
        payload = get_payload(token)
        logger.debug(f"get_user_by_token() - Got payload with keys: {list(payload.keys())}")
        user = get_user_by_payload(payload)
        logger.debug(f"get_user_by_token() - User from payload: {user}, id: {user.id if user else 'None'}")
        return user
    except Exception as e:
        logger.error(f"get_user_by_token() - Error processing token: {str(e)}")
        raise
