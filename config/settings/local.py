from .base import *  # noqa
from .base import env

# GENERAL
# ------------------------------------------------------------------------------
USE_SILK = False

# https://docs.djangoproject.com/en/dev/ref/settings/#secret-key
SECRET_KEY = env(
    "DJANGO_SECRET_KEY",
    default="XA3MPNT1srMGeX0nDKTtL10T5D1k3oLednwShggYSbvFvI3ASF5ew39rnKqemnMu",
)

# CACHES
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#caches
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "",
    }
}

# EMAIL
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#email-backend
EMAIL_BACKEND = env(
    "DJANGO_EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)

# https://django-debug-toolbar.readthedocs.io/en/latest/installation.html#internal-ips
INTERNAL_IPS = ["127.0.0.1", "10.0.2.2"]
if env("USE_DOCKER") == "yes":
    import socket

    hostname, _, ips = socket.gethostbyname_ex(socket.gethostname())
    INTERNAL_IPS += [".".join(ip.split(".")[:-1] + ["1"]) for ip in ips]

# django-extensions
# ------------------------------------------------------------------------------
# https://django-extensions.readthedocs.io/en/latest/installation_instructions.html#configuration
INSTALLED_APPS += ["django_extensions"]  # noqa F405

# Celery
# ------------------------------------------------------------------------------
CELERY_TASK_EAGER_PROPAGATES = (
    True  # If this is True, eagerly executed tasks will propagate exceptions
)
CELERY_RESULT_BACKEND = env("REDIS_URL")
CELERY_BROKER_URL = env("REDIS_URL")

# CELERY_BROKER_URL = "memory://"
# CELERY_RESULT_BACKEND = "cache"
# CELERY_CACHE_BACKEND = "memory"

# SECURITY
# ------------------------------------------------------------------------------
# https://docs.djangoproject.com/en/dev/ref/settings/#session-cookie-httponly
SESSION_COOKIE_HTTPONLY = False
# https://docs.djangoproject.com/en/dev/ref/settings/#csrf-cookie-httponly
CSRF_COOKIE_HTTPONLY = False
# https://docs.djangoproject.com

# Your stuff...
# ------------------------------------------------------------------------------
if DEBUG and USE_SILK:
    MIDDLEWARE += [
        "django_cprofile_middleware.middleware.ProfilerMiddleware",
        "silk.middleware.SilkyMiddleware",
    ]
    SILKY_PYTHON_PROFILER = True

DEBUG = True
