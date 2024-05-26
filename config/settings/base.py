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
CELERY_BROKER_URL = env("CELERY_BROKER_URL")
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
NLM_INGEST_USE_OCR = False  # IF True, always tell nlm-ingestor to use OCR (Tesseract)
NLM_INGEST_HOSTNAME = (
    "http://nlm-ingestor:5001"  # Hostname to send nlm-ingestor REST requests to
)
NLM_INGEST_API_KEY = None  # If the endpoint is secured with an API_KEY, specify it here, otherwise use None

# Embeddings / Semantic Search
EMBEDDINGS_MICROSERVICE_URL = "http://vector-embedder:8000"
VECTOR_EMBEDDER_API_KEY = "abc123"

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
