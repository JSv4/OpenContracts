"""
ASGI config for OpenContracts project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/dev/howto/deployment/asgi/

"""
import logging
import os

import django
from django.conf import settings


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
from config.websocket.consumers.corpus_conversation import CorpusQueryConsumer  # noqa: E402
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

# Choose the appropriate middleware based on USE_AUTH0
if settings.USE_AUTH0:
    logger.info("USE_AUTH0 set to True, using WebsocketAuth0TokenMiddleware")
    from config.websocket.middlewares.websocket_auth0_middleware import WebsocketAuth0TokenMiddleware  # type: ignore
    websocket_auth_middleware = WebsocketAuth0TokenMiddleware
else:
    logger.info("USE_AUTH0 set to False, using GraphQLJWTTokenAuthMiddleware")
    from config.websocket.middleware import GraphQLJWTTokenAuthMiddleware
    websocket_auth_middleware = GraphQLJWTTokenAuthMiddleware


# Create the ASGI application with proper middleware order
# 1. Protocol routing
# 2. Auth middleware (determined above)
# 3. Logging middleware
# 4. URL routing
application = ProtocolTypeRouter(
    {
        "http": django_application,
        "websocket": websocket_auth_middleware(
                URLRouter(websocket_urlpatterns)
        ),
    }
)

logger.info("ASGI application configured with WebSocket support")
