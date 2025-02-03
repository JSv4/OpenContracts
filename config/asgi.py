"""
ASGI config for OpenContracts project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/dev/howto/deployment/asgi/

"""
import logging
import os

import django

from config.websocket.consumers.corpus_conversation import CorpusQueryConsumer

# This is intentional to avoid Django breaking on startup
django.setup()  # noqa: E402

import sys  # noqa: E402
from pathlib import Path  # noqa: E402

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402
from django.urls import re_path  # noqa: E402

from config.websocket.consumers.document_conversation import (  # noqa: E402
    DocumentQueryConsumer,
)
from config.websocket.middleware import GraphQLJWTTokenAuthMiddleware  # noqa: E402

logger = logging.getLogger(__name__)

# This allows easy placement of apps within the interior
# delphic directory.
BASE_DIR = Path(__file__).resolve(strict=True).parent.parent
sys.path.append(str(BASE_DIR / "delphic"))

# If DJANGO_SETTINGS_MODULE is unset, default to the local settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

# This application object is used by any ASGI server configured to use this file.
django_application = get_asgi_application()

document_query_pattern = re_path(
    r"ws/document/(?P<document_id>[-a-zA-Z0-9_=]+)/query/$",
    DocumentQueryConsumer.as_asgi(),
)

corpus_query_pattern = re_path(
    r"ws/corpus/(?P<corpus_id>[-a-zA-Z0-9_=]+)/query/$",
    CorpusQueryConsumer.as_asgi(),
)

websocket_urlpatterns = [
    document_query_pattern,
    corpus_query_pattern,
]

# Log all registered websocket patterns
for pattern in websocket_urlpatterns:
    logger.info(f"Registered WebSocket URL pattern: {pattern.pattern}")


class LoggingMiddleware:
    """
    Simple logging middleware that logs websocket connection attempts.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "websocket":
            logger.info(f"WebSocket connection attempt - Path: {scope['path']}")
            logger.info(f"WebSocket scope: {scope}")
            if "user" in scope:
                logger.info(f"Authenticated user: {scope['user']}")
            else:
                logger.warning("No user in scope")
        return await self.app(scope, receive, send)


# Create the ASGI application with proper middleware order
# 1. Protocol routing
# 2. Authentication middleware
# 3. Logging middleware
# 4. URL routing
application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": GraphQLJWTTokenAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)

logger.info("ASGI application configured with WebSocket support")
