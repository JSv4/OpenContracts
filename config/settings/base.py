"""
Base settings to build other settings files upon.
"""
import pathlib
from datetime import timedelta
from pathlib import Path

import environ

ROOT_DIR = Path(__file__).resolve(strict=True).parent.parent.parent
# opencontractserver/
APPS_DIR = ROOT_DIR / "opencontractserver"

env = environ.Env()

READ_DOT_ENV_FILE = env.bool("DJANGO_READ_DOT_ENV_FILE", default=True)
if READ_DOT_ENV_FILE:
    # OS environment variables take precedence over variables from .env
    env.read_env(str(ROOT_DIR / ".env"))

# GENERAL
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#allowed-hosts
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS", default=["localhost", "0.0.0.0", "127.0.0.1"]
)
print(f"Open Contracts allowed hosts: {ALLOWED_HOSTS}")

# https://docs.djangoproject.com/en/dev/ref/settings/#debug
DEBUG = env.bool("DJANGO_DEBUG", False)

# Use AWS - use AWS S3 storage instead of local disk
USE_AWS = env.bool("USE_AWS", False)

# Activate Open Contracts Analyzer Functionality
USE_ANALYZER = env.bool("USE_ANALYZER", False)
CALLBACK_ROOT_URL_FOR_ANALYZER = env.str("CALLBACK_ROOT_URL_FOR_ANALYZER", None)

# Set max file upload size to 5 GB for large corpuses
DATA_UPLOAD_MAX_MEMORY_SIZE = 5242880000
# Local time zone. Choices are
# http://en.wikipedia.org/wiki/List_of_tz_zones_by_name
# though not all of them may be available with every OS.
# In Windows, this must be set to your system time zone.
TIME_ZONE = "UTC"
# https://docs.djangoproject.com/en/dev/ref/settings/#language-code
LANGUAGE_CODE = "en-us"
# https://docs.djangoproject.com/en/dev/ref/settings/#site-id
SITE_ID = 1
# https://docs.djangoproject.com/en/dev/ref/settings/#use-i18n
USE_I18N = True
# https://docs.djangoproject.com/en/dev/ref/settings/#use-l10n
USE_L10N = True
# https://docs.djangoproject.com/en/dev/ref/settings/#use-tz
USE_TZ = True
# https://docs.djangoproject.com/en/dev/ref/settings/#locale-paths
LOCALE_PATHS = [str(ROOT_DIR / "locale")]

# DATABASES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#databases
DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

# https://docs.djangoproject.com/en/stable/ref/settings/#std:setting-DEFAULT_AUTO_FIELD
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# URLS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#root-urlconf
ROOT_URLCONF = "config.urls"
# https://docs.djangoproject.com/en/dev/ref/settings/#wsgi-application
WSGI_APPLICATION = "config.wsgi.application"

# APPS
# ------------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.sites",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.admin",
    "django.forms",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "django_filters",
    "graphene_django",
    "guardian",
    "crispy_forms",
    "crispy_bootstrap5",
    "django_celery_beat",
    "rest_framework",
    "rest_framework.authtoken",
    "tree_queries",
]

LOCAL_APPS = [
    "opencontractserver.users",
    "opencontractserver.documents",
    "opencontractserver.corpuses",
    "opencontractserver.annotations",
    "opencontractserver.analyzer",
    "opencontractserver.extracts",
]

# https://docs.djangoproject.com/en/dev/ref/settings/#installed-apps
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# MIGRATIONS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#migration-modules
MIGRATION_MODULES = {"sites": "opencontractserver.contrib.sites.migrations"}

# USER LIMITS (FOR USERS WITH IS_USAGE_CAPPED=True)
# ------------------------------------------------------------------------------
USAGE_CAPPED_USER_DOC_CAP_COUNT = env.int(
    "USAGE_CAPPED_USER_CORPUS_CAP_COUNT", default=10
)
USAGE_CAPPED_USER_CAN_USE_ANALYZERS = env.bool(
    "USAGE_CAPPED_USER_CAN_USE_ANALYZERS", default=True
)
USAGE_CAPPED_USER_CAN_IMPORT_CORPUS = env.bool(
    "USAGE_CAPPED_USER_CAN_IMPORT_CORPUS", default=False
)
USAGE_CAPPED_USER_CAN_EXPORT_CORPUS = env.bool(
    "USAGE_CAPPED_USER_CAN_EXPORT_CORPUS", default=True
)

# UPLOAD CONTROLS
# ------------------------------------------------------------------------------
ALLOWED_DOCUMENT_MIMETYPES = ["application/pdf"]

# AUTHENTICATION
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#authentication-backends
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "guardian.backends.ObjectPermissionBackend",
]

# AUTH0
USE_AUTH0 = env.bool("USE_AUTH0", False)
USE_API_KEY_AUTH = env.bool("ALLOW_API_KEYS", True)

if USE_AUTH0:

    AUTH0_CLIENT_ID = env("AUTH0_CLIENT_ID")
    AUTH0_API_AUDIENCE = env("AUTH0_API_AUDIENCE")
    AUTH0_DOMAIN = env("AUTH0_DOMAIN")
    AUTH0_M2M_MANAGEMENT_API_SECRET = env("AUTH0_M2M_MANAGEMENT_API_SECRET")
    AUTH0_M2M_MANAGEMENT_API_ID = env("AUTH0_M2M_MANAGEMENT_API_ID")
    AUTH0_M2M_MANAGEMENT_GRANT_TYPE = env("AUTH0_M2M_MANAGEMENT_GRANT_TYPE")

    AUTHENTICATION_BACKENDS += [
        "config.graphql_auth0_auth.backends.Auth0RemoteUserJSONWebTokenBackend",
    ]

else:
    AUTHENTICATION_BACKENDS += [
        "graphql_jwt.backends.JSONWebTokenBackend",
    ]

if USE_API_KEY_AUTH:
    API_TOKEN_HEADER_NAME = "AUTHORIZATION"
    API_TOKEN_PREFIX = "KEY"
    AUTHENTICATION_BACKENDS += [
        "config.graphql_api_key_auth.backends.Auth0ApiKeyBackend"
    ]

# https://docs.djangoproject.com/en/dev/ref/settings/#auth-user-model
AUTH_USER_MODEL = "users.User"
# https://docs.djangoproject.com/en/dev/ref/settings/#login-redirect-url
LOGIN_REDIRECT_URL = "users:redirect"
# https://docs.djangoproject.com/en/dev/ref/settings/#login-url
LOGIN_URL = "account_login"

# Guardian Settings
# ------------------------------------------------------------------------------
GUARDIAN_AUTO_PREFETCH = True
ANONYMOUS_USER_NAME = "Anonymous"

# PASSWORDS
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#password-hashers
PASSWORD_HASHERS = [
    # https://docs.djangoproject.com/en/dev/topics/auth/passwords/#using-argon2-with-django
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]
# https://docs.djangoproject.com/en/dev/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# MIDDLEWARE
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#middleware
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.common.BrokenLinkEmailsMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# STATIC
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#static-root
STATIC_ROOT = str(ROOT_DIR / "staticfiles")
# https://docs.djangoproject.com/en/dev/ref/settings/#static-url
STATIC_URL = "/static/"
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#std:setting-STATICFILES_DIRS
STATICFILES_DIRS = [str(APPS_DIR / "static")]
# https://docs.djangoproject.com/en/dev/ref/contrib/staticfiles/#staticfiles-finders
STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]

if not USE_AWS:
    # STATIC
    # ------------------------
    STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

    # MEDIA
    # ------------------------------------------------------------------------------
    # https://docs.djangoproject.com/en/dev/ref/settings/#media-root
    MEDIA_ROOT = str(APPS_DIR / "media")
    # https://docs.djangoproject.com/en/dev/ref/settings/#media-url
    MEDIA_URL = "/media/"
else:
    # STORAGES
    # ------------------------------------------------------------------------------
    # https://django-storages.readthedocs.io/en/latest/#installation
    INSTALLED_APPS += ["storages"]  # noqa F405
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_QUERYSTRING_AUTH = True
    # DO NOT change these unless you know what you're doing.
    _AWS_EXPIRY = 60 * 60 * 24 * 7
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_S3_OBJECT_PARAMETERS = {
        "CacheControl": f"max-age={_AWS_EXPIRY}, s-maxage={_AWS_EXPIRY}, must-revalidate"
    }
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#settings
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default=None)
    # https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html#cloudfront
    AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default=None)
    aws_s3_domain = (
        AWS_S3_CUSTOM_DOMAIN or f"{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com"
    )

    # Copied values from botos3 for OpenEdgar Crawlers rather than rewriting the crawlers (for now). Lazy :-)
    S3_ACCESS_KEY = AWS_ACCESS_KEY_ID
    S3_SECRET_KEY = AWS_SECRET_ACCESS_KEY
    S3_BUCKET = AWS_STORAGE_BUCKET_NAME
    S3_PREFIX = env("S3_PREFIX", default="documents")
    S3_COMPRESSION_LEVEL = int(env("S3_COMPRESSION_LEVEL", default=6))

    # STATIC
    # ------------------------
    STATICFILES_STORAGE = "opencontractserver.utils.storages.StaticRootS3Boto3Storage"
    COLLECTFAST_STRATEGY = "collectfast.strategies.boto3.Boto3Strategy"
    STATIC_URL = f"https://{aws_s3_domain}/static/"

    # MEDIA
    # ------------------------------------------------------------------------------
    DEFAULT_FILE_STORAGE = "opencontractserver.utils.storages.MediaRootS3Boto3Storage"
    MEDIA_URL = f"https://{aws_s3_domain}/media/"
    S3_DOCUMENT_PATH = env("S3_DOCUMENT_PATH", default="open_contracts")
    MEDIA_ROOT = str(APPS_DIR / "media")

# TEMPLATES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#templates
TEMPLATES = [
    {
        # https://docs.djangoproject.com/en/dev/ref/settings/#std:setting-TEMPLATES-BACKEND
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # https://docs.djangoproject.com/en/dev/ref/settings/#template-dirs
        "DIRS": [str(APPS_DIR / "templates")],
        "OPTIONS": {
            # https://docs.djangoproject.com/en/dev/ref/settings/#template-loaders
            # https://docs.djangoproject.com/en/dev/ref/templates/api/#loader-types
            "loaders": [
                "django.template.loaders.filesystem.Loader",
                "django.template.loaders.app_directories.Loader",
            ],
            # https://docs.djangoproject.com/en/dev/ref/settings/#template-context-processors
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.template.context_processors.i18n",
                "django.template.context_processors.media",
                "django.template.context_processors.static",
                "django.template.context_processors.tz",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

# https://docs.djangoproject.com/en/dev/ref/settings/#form-renderer
FORM_RENDERER = "django.forms.renderers.TemplatesSetting"

# http://django-crispy-forms.readthedocs.io/en/latest/install.html#template-packs
CRISPY_TEMPLATE_PACK = "bootstrap5"
CRISPY_ALLOWED_TEMPLATE_PACKS = "bootstrap5"

# FIXTURES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#fixture-dirs
FIXTURE_DIRS = (str(APPS_DIR / "fixtures"),)

# SECURITY
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#session-cookie-httponly
SESSION_COOKIE_HTTPONLY = True
# https://docs.djangoproject.com/en/dev/ref/settings/#csrf-cookie-httponly
CSRF_COOKIE_HTTPONLY = True
# https://docs.djangoproject.com/en/dev/ref/settings/#secure-browser-xss-filter
SECURE_BROWSER_XSS_FILTER = True
# https://docs.djangoproject.com/en/dev/ref/settings/#x-frame-options
X_FRAME_OPTIONS = "DENY"

# EMAIL
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#email-backend
EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)
# https://docs.djangoproject.com/en/dev/ref/settings/#email-timeout
EMAIL_TIMEOUT = 5

# ADMIN
# ------------------------------------------------------------------------------
# Django Admin URL.
ADMIN_URL = "admin/"
# https://docs.djangoproject.com/en/dev/ref/settings/#admins
ADMINS = [("""JSv4""", "support@opensource.legal")]
# https://docs.djangoproject.com/en/dev/ref/settings/#managers
MANAGERS = ADMINS

# LOGGING
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#logging
# See https://docs.djangoproject.com/en/dev/topics/logging for
# more details on how to customize your logging configuration.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(levelname)s %(asctime)s %(module)s "
            "%(process)d %(thread)d %(message)s"
        }
    },
    "handlers": {
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        }
    },
    "root": {"level": "INFO", "handlers": ["console"]},
}

# Celery
# ------------------------------------------------------------------------------
if USE_TZ:
    # http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-timezone
    CELERY_TIMEZONE = TIME_ZONE
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-broker_url
CELERY_BROKER_URL = env("REDIS_URL")
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-result_backend
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-accept_content
CELERY_ACCEPT_CONTENT = ["json"]
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-task_serializer
CELERY_TASK_SERIALIZER = "json"
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-result_serializer
CELERY_RESULT_SERIALIZER = "json"
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#task-time-limit
# TODO: set to whatever value is adequate in your circumstances
# CELERY_TASK_TIME_LIMIT = 5 * 3600
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#task-soft-time-limit
# TODO: set to whatever value is adequate in your circumstances
# CELERY_TASK_SOFT_TIME_LIMIT = 3600
# http://docs.celeryproject.org/en/latest/userguide/configuration.html#beat-scheduler
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_WORKER_MAX_MEMORY_PER_CHILD = 14240000  # 14 GB (thousands of kilobytes)
CELERY_MAX_TASKS_PER_CHILD = 4
CELERY_PREFETCH_MULTIPLIER = 1
CELERY_RESULT_BACKEND_MAX_RETRIES=10
# django-rest-framework
# -------------------------------------------------------------------------------
# django-rest-framework - https://www.django-rest-framework.org/api-guide/settings/
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}


# Base configuration
BASE_PATH = "./"
DATA_PATH = pathlib.Path(BASE_PATH, "data")
MODEL_PATH = pathlib.Path(BASE_PATH, "model")

# Graphene
# ------------------------------------------------------------------------------
GRAPHENE = {
    "SCHEMA": "config.graphql.schema.schema",
    "MIDDLEWARE": [
        "config.graphql.permission_annotator.middleware.PermissionAnnotatingMiddleware",
        "graphql_jwt.middleware.JSONWebTokenMiddleware",
        "config.graphql_api_key_auth.middleware.ApiKeyTokenMiddleware",
    ],
}


GRAPHQL_JWT = {
    "JWT_AUTH_HEADER_PREFIX": "Bearer",
    "JWT_VERIFY_EXPIRATION": True,
    "JWT_LONG_RUNNING_REFRESH_TOKEN": True,
    "JWT_EXPIRATION_DELTA": timedelta(days=7),
    "JWT_REFRESH_EXPIRATION_DELTA": timedelta(days=14),
    "JWT_ALGORITHM": "HS256",
    "JWT_ALLOW_ANY_HANDLER": "config.graphql.jwt_overrides.allow_any",
}

# Constants for Permissioning
DEFAULT_PERMISSIONS_GROUP = "Public Objects Access"

# Nlm-ingestor settings
# -----------------------------------------------------------------------------
NLM_INGESTOR_ACTIVE = env.bool(
    "NLM_INGESTOR_ACTIVE", False
)  # Use nlm-ingestor where this is True... otherwise PAWLs
NLM_INGEST_USE_OCR = (
    True  # IF True, allow ingestor to use OCR when no text found in pdf.
)
NLM_INGEST_HOSTNAME = (
    "http://nlm-ingestor:5001"  # Hostname to send nlm-ingestor REST requests to
)
NLM_INGEST_API_KEY = None  # If the endpoint is secured with an API_KEY, specify it here, otherwise use None

# Embeddings / Semantic Search
EMBEDDINGS_MICROSERVICE_URL = "http://vector-embedder:8000"
VECTOR_EMBEDDER_API_KEY = "abc123"

# LLM SETTING
OPENAI_API_KEY = env.str("OPENAI_API_KEY", default="")
OPENAI_MODEL = env.str("OPENAI_MODEL", default="gpt-4o")
EMBEDDINGS_MODEL = env.str("EMBEDDINGS_MODEL", default="gpt-4o")

# CORS
# ------------------------------------------------------------------------------
CORS_ORIGIN_WHITELIST = [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
]
CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
    "AUTHORIZATION",
    "x-csrf-token",
]
CORS_EXPOSE_HEADERS = [
    "my-custom-header",
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

DEFAULT_IMAGE = """data:image/png;base64,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"""  # noqa
