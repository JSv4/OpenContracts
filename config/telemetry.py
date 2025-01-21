from __future__ import annotations

import logging
from datetime import datetime, timezone

from django.conf import settings
from posthog import Posthog

logger = logging.getLogger(__name__)


def _get_installation_id() -> str | None:
    """Get the installation ID from the Installation model"""
    from opencontractserver.users.models import Installation

    try:
        installation = Installation.objects.get()
        return str(installation.id)
    except Exception as e:
        logger.warning(f"Failed to get installation ID: {e}")
        return None


def record_event(event_type: str, properties: dict | None = None) -> bool:
    """
    Record a telemetry event.

    Args:
        event_type: Type of event (e.g., "installation", "error", "usage")
        properties: Optional additional properties to include

    Returns:
        bool: Whether the event was successfully recorded
    """
    # Don't collect TEST telemtry...
    if settings.MODE == "TEST":
        logger.debug("Telemetry disabled in TEST mode")
        return False

    if not settings.TELEMETRY_ENABLED:
        return False

    installation_id = _get_installation_id()
    logger.debug(f"Telemetry id: {installation_id}")
    if not installation_id:
        return False

    try:
        client = Posthog(
            project_api_key=settings.POSTHOG_API_KEY, host=settings.POSTHOG_HOST
        )

        client.capture(
            distinct_id=installation_id,
            event=f"opencontracts.{event_type}",
            properties={
                "package": "opencontracts",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "installation_id": installation_id,
                **(properties or {}),
            },
        )
        return True
    except Exception as e:
        logger.warning(f"Failed to send telemetry: {e}")
        return False
