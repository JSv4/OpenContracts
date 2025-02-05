import json
import uuid
import logging  

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
    header = jwt.get_unverified_header(token)
    jwks = requests.get(
        f"https://{auth0_settings.AUTH0_DOMAIN}/.well-known/jwks.json"
    ).json()
    public_key = None
    for jwk in jwks["keys"]:
        if jwk["kid"] == header["kid"]:
            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))

    if public_key is None:
        raise Exception("Public key not found.")

    issuer = f"https://{auth0_settings.AUTH0_DOMAIN}/"
    return jwt.decode(
        token,
        public_key,
        audience=auth0_settings.AUTH0_API_AUDIENCE,
        issuer=issuer,
        algorithms=[auth0_settings.AUTH0_TOKEN_ALGORITHM],
    )


def get_payload(token):
    try:
        payload = auth0_settings.AUTH0_DECODE_HANDLER(token)
    except jwt.ExpiredSignatureError:
        raise exceptions.JSONWebTokenExpired()
    except jwt.DecodeError:
        raise exceptions.JSONWebTokenError(_("Error decoding signature"))
    except jwt.InvalidTokenError:
        raise exceptions.JSONWebTokenError(_("Invalid token"))
    return payload


def user_can_authenticate(user):
    """
    Reject users with is_active=False. Custom user models that don't have
    that attribute are allowed.
    """
    is_active = getattr(user, "is_active", None)
    return is_active or is_active is None


def configure_user(user):
    """
    Configure a user after creation and return the updated user.
    Also triggers async task to sync user data with auth0 profile.
    """
    user.is_active = True
    user.set_password(
        uuid.uuid4().__str__()
    )  # Random django password to prevent malicious use of user with no pass
    user.first_signed_in = timezone.now()
    user.save()

    # For new users from outside
    sync_remote_user.delay(
        user.username
    )  # This is run async, but I'm not sure we want this actually...

    return user


def get_auth0_user_from_token(remote_username):

    if not remote_username:
        return
    user = None

    UserModel = get_user_model()
    logger.info(f"get_auth0_user_from_token() - UserModel: {UserModel}")
    logger.info(f"get_auth0_user_from_token() - remote_username: {remote_username}")
    logger.info(f"get_auth0_user_from_token() - AUTH0_CREATE_NEW_USERS: {auth0_settings.AUTH0_CREATE_NEW_USERS}")

    if auth0_settings.AUTH0_CREATE_NEW_USERS:
        user, created = UserModel._default_manager.get_or_create(
            **{UserModel.USERNAME_FIELD: remote_username}
        )
        logger.info(f"get_auth0_user_from_token() - user created: {created}")
        logger.info(f"get_auth0_user_from_token() - user: {user}")
        if created:
            logger.info(f"get_auth0_user_from_token() - configuring new user: {user}")
            user = configure_user(user)
            logger.info(f"get_auth0_user_from_token() - user configured: {user}")

    else:
        try:
            user = UserModel._default_manager.get_by_natural_key(remote_username)
            logger.info(f"get_auth0_user_from_token() - found existing user: {user}")
        except UserModel.DoesNotExist:
            logger.info("get_auth0_user_from_token() - user does not exist")
            pass

    if user is None:
        logger.info("get_auth0_user_from_token() - returning None as no user found/created")
        return user
    else:
        is_active = user.is_active and user_can_authenticate(user)
        logger.info(f"get_auth0_user_from_token() - user active status: {is_active}")
        return user if is_active else None


def jwt_get_username_from_payload_handler(payload):
    return payload.get("sub")


def get_user_by_payload(payload):

    # print("get_user_by_payload() - payload", payload)
    username = jwt_get_username_from_payload_handler(payload)
    logger.info(f"get_user_by_payload() - username: {username}")
    # print("get_user_by_payload() - username", username)

    if not username:
        raise exceptions.JSONWebTokenError(_("Invalid payload"))
    
    logger.info(f"get_user_by_payload() - auth0_settings.AUTH0_GET_USER_FROM_TOKEN_HANDLER: {auth0_settings.AUTH0_GET_USER_FROM_TOKEN_HANDLER}")

    user = auth0_settings.AUTH0_GET_USER_FROM_TOKEN_HANDLER(username)
    logger.info(f"get_user_by_payload - user: {user}")

    if user is not None and not getattr(user, "is_active", True):
        raise exceptions.JSONWebTokenError(_("User is disabled"))


    logger.info(f"get_user_by_payload() - returning user: {user}")
    return user


def get_user_by_token(token, **kwargs):
    """
    Given a JWT token from auth0, verify the token. If valid,
    1) check if matching user exists and return obj or, 2), if no
    user exists and settings is set to create user obj for unknown user,
    create a user, configure it, and return user obj
    """
    payload = get_payload(token)
    logger.info(f"get_user_by_token() - payload: {payload}")
    return get_user_by_payload(payload)
