"""Import the application parsers without a database or Redis service.

Parser settings are explicit worker-local snapshots, loaded from component
schemas by scripts.remote_ingest.parsers. Target PipelineSettings are never read.
The dummy backend also prevents an inherited DATABASE_URL from enabling queries.
"""

import os

# base.py requires a DATABASE_URL during import; replace its backend below.
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/oc_remote_worker.sqlite3")
os.environ.setdefault("DJANGO_SECRET_KEY", "remote-worker-not-a-secret-no-web-surface")

from .base import *  # noqa: E402,F401,F403

DEBUG = False
DATABASES = {"default": {"ENGINE": "django.db.backends.dummy"}}
