"""Single-flight admission using token-scoped outstanding upload measurements."""

from __future__ import annotations

import logging
import random
import threading
import time
from collections.abc import Callable
from datetime import timezone
from email.utils import parsedate_to_datetime

logger = logging.getLogger("oc_remote_ingest")

POLL_INTERVAL_SECONDS = 15
INITIAL_BACKOFF_SECONDS = 2
MAX_BACKOFF_SECONDS = 60
MAX_RETRY_AFTER_SECONDS = 300
JITTER_MIN = 0.5


class StatusPollError(Exception):
    """Safe status diagnostic; never include credentials, bodies or request URLs."""

    def __init__(
        self,
        message: str,
        *,
        permanent: bool = False,
        retry_after: float = 0,
        reason: str = "invalid_response",
        http_status: int | None = None,
    ):
        super().__init__(message)
        self.permanent = permanent
        self.retry_after = retry_after
        self.reason = reason
        self.http_status = http_status


def retry_after_seconds(value: str | None) -> float:
    """Accept HTTP delay-seconds or an HTTP-date, bounded for periodic retries."""
    if not value:
        return 0
    try:
        delay: float
        value = value.strip()
        if value.isascii() and value.isdigit():
            delay = int(value)
        else:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            delay = date.timestamp() - time.time()
        return max(0, min(delay, MAX_RETRY_AFTER_SECONDS))
    except (ValueError, TypeError, OverflowError):
        return 0


def validate_watermarks(high: int, low: int) -> None:
    if high > 0 and not 0 <= low <= high:
        raise ValueError("Enabled admission requires 0 <= --queue-low <= --queue-high")


class AdmissionGovernor:
    """Grant admission under one lock; never reuse an in-flight/failed/stale poll.

    A grant precedes preparation, so already-admitted workers can still upload
    after another caller pauses admission. HTTP runs outside the condition lock;
    stop() wakes waiters immediately while the poll owner drains its timed call.
    """

    def __init__(self, poll: Callable[[], int], high: int, low: int):
        validate_watermarks(high, low)
        self._poll = poll
        self._high = high
        self._low = low
        self._condition = threading.Condition()
        self.stopped = threading.Event()
        self.fatal_error: StatusPollError | None = None
        self._polling = False
        self._count: int | None = None
        self._next_poll = 0.0
        self._paused = False
        self._backoff = INITIAL_BACKOFF_SECONDS

    def stop(self) -> None:
        with self._condition:
            self.stopped.set()
            self._condition.notify_all()

    def admit(self) -> bool:
        while True:
            with self._condition:
                if self.stopped.is_set():
                    return False
                if self._high <= 0:
                    return True
                if self._polling:
                    self._condition.wait()
                    continue
                remaining = self._next_poll - time.monotonic()
                if remaining > 0:
                    if self._count is not None and not self._paused:
                        return True
                    self._condition.wait(remaining)
                    continue
                self._polling = True
                self._count = None

            error = None
            try:
                count = self._poll()
            except StatusPollError as exc:
                error = exc
            except Exception:  # noqa: BLE001 — wake all waiters on unexpected failure
                error = StatusPollError(
                    "Unexpected status polling failure; check client/configuration",
                    permanent=True,
                )
            except BaseException:
                # Preserve control-flow exceptions, but never strand waiters or
                # allow another poll to admit work after its owner has aborted.
                with self._condition:
                    self._polling = False
                    self.fatal_error = StatusPollError(
                        "Status polling aborted; check client/runtime before restarting",
                        permanent=True,
                    )
                    self.stopped.set()
                    self._condition.notify_all()
                raise

            with self._condition:
                self._polling = False
                self._condition.notify_all()
                if self.stopped.is_set():
                    return False
                if error is not None:
                    if error.permanent:
                        self.fatal_error = error
                        self.stopped.set()
                        return False
                    delay = max(
                        self._backoff * random.uniform(JITTER_MIN, 1),
                        error.retry_after,
                    )
                    self._backoff = min(self._backoff * 2, MAX_BACKOFF_SECONDS)
                    self._next_poll = time.monotonic() + delay
                    logger.warning(
                        "admission paused: token-scoped outstanding uploads unknown "
                        "(%s); retrying in %.1fs",
                        error,
                        delay,
                    )
                else:
                    self._count = count
                    self._next_poll = time.monotonic() + POLL_INTERVAL_SECONDS
                    self._backoff = INITIAL_BACKOFF_SECONDS
                    paused = count > (self._low if self._paused else self._high)
                    if paused != self._paused:
                        logger.info(
                            "admission %s: token-scoped outstanding uploads=%s",
                            "paused" if paused else "resumed",
                            count,
                        )
                    self._paused = paused
