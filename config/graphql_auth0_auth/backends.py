import graphql_jwt
from django.contrib.auth import get_user_model

from config.graphql_auth0_auth.utils import get_user_by_token

UserModel = get_user_model()


class Auth0RemoteUserJSONWebTokenBackend:
    def authenticate(self, request=None, **kwargs):
        if request is None or getattr(request, "_jwt_token_auth", False):
            return None

        token = graphql_jwt.utils.get_credentials(request, **kwargs)
        # print("Auth0RemoteUserJSONWebTokenBackend - token", token)

        if token is not None:
            return get_user_by_token(token)

        return None

    def get_user(self, user_id):
        try:
            return UserModel._default_manager.get(pk=user_id)
        except UserModel.DoesNotExist:
            return None
