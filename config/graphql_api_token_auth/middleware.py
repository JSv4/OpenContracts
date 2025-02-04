from django.contrib.auth import authenticate, get_user_model

from config.graphql_api_token_auth.utils import (
    get_http_authorization,
    get_token_argument,
)

User = get_user_model()


def _context_has_user(request):
    return hasattr(request, "user") and request.user.is_authenticated


def _authenticate(request):
    is_anonymous = _context_has_user(request)
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

        # Check to see if user already on context

        if "user" in info.context.POST:
            existing_user = info.context.POST["user"]
            if (
                existing_user is not None
                and isinstance(existing_user, User)
                and existing_user.is_authenticated
            ):
                return next(root, info, **kwargs)

        context = info.context
        token_argument = get_token_argument(context, **kwargs)

        if (
            _authenticate(context) or token_argument is not None
        ) and self.authenticate_context(info, **kwargs):

            # If we already have an authenticated user for our request, don't bother re-authenticating
            # same request. This was causing a massive performance hit.
            if not _context_has_user(context):
                user = authenticate(request=context, **kwargs)

                if user is not None:
                    context.user = user

        return next(root, info, **kwargs)
