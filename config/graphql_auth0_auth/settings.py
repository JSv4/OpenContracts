from django.conf import settings
from django.test.signals import setting_changed
from django.utils.module_loading import import_string

DEFAULTS = {
    "AUTH0_TOKEN_ALGORITHM": "RS256",
    "AUTH0_DECODE_HANDLER": "config.graphql_auth0_auth.utils.jwt_auth0_decode",
    "AUTH0_GET_USER_FROM_TOKEN_HANDLER": "config.graphql_auth0_auth.utils.get_auth0_user_from_token",
    "AUTH0_CREATE_NEW_USERS": True,
    "AUTH0_CLIENT_ID": settings.AUTH0_CLIENT_ID,
    "AUTH0_API_AUDIENCE": settings.AUTH0_API_AUDIENCE,
    "AUTH0_DOMAIN": settings.AUTH0_DOMAIN,
    "AUTH0_M2M_MANAGEMENT_API_SECRET": settings.AUTH0_M2M_MANAGEMENT_API_SECRET,
    "AUTH0_M2M_MANAGEMENT_API_ID": settings.AUTH0_M2M_MANAGEMENT_API_ID,
    "AUTH0_M2M_MANAGEMENT_GRANT_TYPE": settings.AUTH0_M2M_MANAGEMENT_GRANT_TYPE,
}

IMPORT_STRINGS = (
    "AUTH0_DECODE_HANDLER",
    "AUTH0_PAYLOAD_HANDLER",
    "AUTH0_PAYLOAD_GET_USERNAME_HANDLER",
    "AUTH0_GET_USER_FROM_TOKEN_HANDLER",
    "AUTH0_GET_USER_FROM_TOKEN",
)


def perform_import(value, setting_name):
    if isinstance(value, str):
        return import_from_string(value, setting_name)
    if isinstance(value, (list, tuple)):
        return [import_from_string(item, setting_name) for item in value]
    return value


def import_from_string(value, setting_name):
    try:
        return import_string(value)
    except ImportError as e:
        msg = (
            f"Could not import `{value}` for JWT setting `{setting_name}`."
            f"{e.__class__.__name__}: {e}."
        )
        raise ImportError(msg)


class Auth0JWTSettings:
    def __init__(self, defaults, import_strings):
        self.defaults = defaults
        self.import_strings = import_strings
        self._cached_attrs = set()

    def __getattr__(self, attr):
        if attr not in self.defaults:
            raise AttributeError(f"Invalid setting: `{attr}`")

        value = self.user_settings.get(attr, self.defaults[attr])

        if attr in self.import_strings:
            value = perform_import(value, attr)

        self._cached_attrs.add(attr)
        setattr(self, attr, value)
        return value

    @property
    def user_settings(self):
        if not hasattr(self, "_user_settings"):
            self._user_settings = getattr(settings, "AUTH0_JWT", {})
        return self._user_settings

    def reload(self):
        for attr in self._cached_attrs:
            delattr(self, attr)

        self._cached_attrs.clear()

        if hasattr(self, "_user_settings"):
            delattr(self, "_user_settings")


def reload_settings(*args, **kwargs):
    setting = kwargs["setting"]

    if setting == "AUTH0_JWT":
        auth0_settings.reload()


setting_changed.connect(reload_settings)

auth0_settings = Auth0JWTSettings(DEFAULTS, IMPORT_STRINGS)
