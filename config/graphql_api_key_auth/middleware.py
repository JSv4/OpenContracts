from django.contrib.auth import authenticate

from config.graphql_api_key_auth.utils import get_http_authorization, get_token_argument


def _authenticate(request):
    is_anonymous = not hasattr(request, "user") or request.user.is_anonymous
    return is_anonymous and get_http_authorization(request) is not None


class ApiKeyTokenMiddleware:
    def __init__(self):
        self.cached_allow_any = set()

    def authenticate_context(self, info, **kwargs):
        root_path = info.path[0]

        if root_path not in self.cached_allow_any:
            return True
        return False

    def resolve(self, next, root, info, **kwargs):

        context = info.context
        token_argument = get_token_argument(context, **kwargs)

        if (
            _authenticate(context) or token_argument is not None
        ) and self.authenticate_context(info, **kwargs):

            user = authenticate(request=context, **kwargs)

            if user is not None:
                context.user = user

        return next(root, info, **kwargs)
