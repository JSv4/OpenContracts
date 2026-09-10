"""Admission failures/concurrency with mocked HTTP and real threads/SQLite.

Run without Django/services: python -m unittest
opencontractserver.tests.test_remote_ingest_admission
"""

import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
from datetime import datetime, timezone
from email.utils import format_datetime
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import Mock, patch

import requests

from scripts.remote_ingest import admission as admission
from scripts.remote_ingest import oc_remote_ingest as cli


def response(code=200, body=None, **headers):
    return Mock(status_code=code, json=Mock(return_value=body), headers=headers)


def client():
    return cli.TargetClient(
        cast(
            cli.Config,
            SimpleNamespace(
                target_url="https://target.invalid",
                worker_token="private-token",
                verify_tls=True,
            ),
        )
    )


class BacklogClientTests(unittest.TestCase):
    def test_complete_count_and_measured_zero(self):
        for counts in ((0, 0), (3, 7)):
            with self.subTest(counts=counts):
                target = client()
                target.session.get = Mock(
                    side_effect=[response(body={"count": n}) for n in counts]
                )
                self.assertEqual(target.backlog_count(), sum(counts))
                calls = target.session.get.call_args_list
                for call, status in zip(calls, ("PENDING", "PROCESSING")):
                    self.assertIn(f"status={status}&page_size=1", call.args[0])
                    self.assertEqual(
                        call.kwargs["timeout"], cli._HTTP_BACKLOG_TIMEOUT_SECONDS
                    )
                    self.assertFalse(call.kwargs["allow_redirects"])

    def test_failure_of_either_request_never_returns_partial_or_zero(self):
        malformed = response()
        malformed.json.side_effect = ValueError("private-response-body")
        failures = [
            (requests.ConnectionError("private-token"), False),
            (requests.Timeout("private-token"), False),
            (requests.exceptions.InvalidURL("private-token"), True),
            (requests.exceptions.InvalidSchema("private-token"), True),
            (requests.exceptions.MissingSchema("private-token"), True),
            (requests.exceptions.InvalidHeader("private-token"), True),
            (malformed, False),
        ]
        failures += [
            (response(code), code != 429 and code < 500)
            for code in (400, 401, 403, 404, 422, 429, 500, 502, 503, 504, 302)
        ]
        bodies: list[Any] = [
            None,
            [],
            0,
            "private-response-body",
            {},
            {"count": None},
            {"count": True},
            {"count": False},
            {"count": "0"},
            {"count": 0.0},
            {"count": -1},
            {"count": []},
            {"count": {}},
            {"count": float("nan")},
        ]
        failures += [(response(body=body), False) for body in bodies]
        for failure, permanent in failures:
            for position in (0, 1):
                with self.subTest(failure=failure, position=position):
                    target = client()
                    outcomes = [response(body={"count": 9})] * position + [failure]
                    target.session.get = Mock(side_effect=outcomes)
                    with self.assertRaises(admission.StatusPollError) as caught:
                        target.backlog_count()
                    self.assertEqual(caught.exception.permanent, permanent)
                    self.assertNotIn("private", str(caught.exception))
                    self.assertEqual(target.session.get.call_count, position + 1)

    def test_retry_after(self):
        now = 1_800_000_000
        date = format_datetime(
            datetime.fromtimestamp(now + 42, timezone.utc), usegmt=True
        )
        for value, expected in (
            ("12", 12),
            (date, 42),
            ("999999", 300),
            ("0", 0),
            (None, 0),
            ("", 0),
            ("nan", 0),
            ("inf", 0),
            ("-1", 0),
            ("1.5", 0),
            ("invalid", 0),
        ):
            with self.subTest(value=value), patch.object(
                admission.time, "time", return_value=now
            ):
                self.assertEqual(admission.retry_after_seconds(value), expected)
        past = format_datetime(
            datetime.fromtimestamp(now - 5, timezone.utc), usegmt=True
        )
        with patch.object(admission.time, "time", return_value=now):
            self.assertEqual(admission.retry_after_seconds(past), 0)
        for code in (429, 503):
            target = client()
            target.session.get = Mock(
                return_value=response(code, **{"Retry-After": "23"})
            )
            with self.assertRaises(admission.StatusPollError) as caught:
                target.backlog_count()
            self.assertEqual(caught.exception.retry_after, 23)

    def test_status_distinguishes_unknown_and_redacts_details(self):
        ledger = Mock(
            status_counts=Mock(return_value={}), get_meta=Mock(return_value=None)
        )
        target = client()
        for outcome, expected in (
            (response(body={"count": 0}), "PENDING+PROCESSING : 0"),
            (response(body={}), "PENDING+PROCESSING : unknown"),
            (response(401), "OC_WORKER_TOKEN"),
            (requests.ConnectionError("private-token"), "unknown"),
        ):
            target.session.get = Mock(
                side_effect=outcome if isinstance(outcome, Exception) else None,
                return_value=outcome,
            )
            output = StringIO()
            with redirect_stdout(output):
                cli._print_status(ledger, target)
            self.assertIn("Token-scoped outstanding uploads", output.getvalue())
            self.assertIn(expected, output.getvalue())
            self.assertNotIn("private", output.getvalue())


class GovernorTests(unittest.TestCase):
    def start_waiters(self, governor, count=6):
        pool = ThreadPoolExecutor(max_workers=count)
        # LIFO cleanup must wake workers before joining the executor.
        self.addCleanup(pool.shutdown, wait=True, cancel_futures=True)
        self.addCleanup(governor.stop)
        waiting = threading.Event()
        original_wait = governor._condition.wait
        calls = 0

        def observed_wait(timeout=None):
            nonlocal calls
            calls += 1
            if calls >= count - 1:
                waiting.set()
            return original_wait(timeout)

        patcher = patch.object(governor._condition, "wait", observed_wait)
        patcher.start()
        self.addCleanup(patcher.stop)
        futures = [pool.submit(governor.admit) for _ in range(count)]
        self.assertTrue(waiting.wait(3))
        return futures

    def test_first_http_poll_is_single_flight_and_publishes_complete_result(self):
        for outcome in (response(body={"count": 0}), response(401), response(503)):
            with self.subTest(outcome=outcome):
                release = threading.Event()
                target = client()

                def get(*args, **kwargs):
                    self.assertTrue(release.wait(3))
                    return outcome

                target.session.get = Mock(side_effect=get)
                governor = admission.AdmissionGovernor(target.backlog_count, 10, 5)
                futures = self.start_waiters(governor)
                self.addCleanup(release.set)
                self.assertEqual(target.session.get.call_count, 1)
                self.assertFalse(any(f.done() for f in futures))
                release.set()
                if outcome.status_code == 503:
                    # Await publication of failure, before the first (>=1s) retry.
                    with governor._condition:
                        self.assertTrue(
                            governor._condition.wait_for(
                                lambda: not governor._polling, 1
                            )
                        )
                        self.assertIsNone(governor._count)
                        self.assertFalse(any(f.done() for f in futures))
                    governor.stop()
                expected = outcome.status_code == 200
                self.assertEqual([f.result(3) for f in futures], [expected] * 6)
                self.assertEqual(target.session.get.call_count, 2 if expected else 1)

    def test_stop_wakes_initial_poll_waiters_before_http_finishes(self):
        release = threading.Event()
        poll = Mock(side_effect=lambda: (release.wait(3), 0)[1])
        governor = admission.AdmissionGovernor(poll, 10, 5)
        futures = self.start_waiters(governor)
        self.addCleanup(release.set)
        governor.stop()
        # The owner still has its bounded HTTP operation; every other waiter exits.
        for future in futures[1:]:
            self.assertFalse(future.result(1))
        self.assertFalse(futures[0].done())
        release.set()
        self.assertFalse(futures[0].result(1))
        self.assertFalse(governor.admit())
        poll.assert_called_once()

    def test_poll_abort_propagates_and_wakes_waiters_without_external_stop(self):
        class PollAbort(BaseException):
            pass

        for kind in (KeyboardInterrupt, SystemExit, GeneratorExit, PollAbort):
            with self.subTest(kind=kind):
                release = threading.Event()
                failure = kind("private-poll-details")

                def poll():
                    self.assertTrue(release.wait(3))
                    raise failure

                measure = Mock(side_effect=poll)
                governor = admission.AdmissionGovernor(measure, 10, 5)
                futures = self.start_waiters(governor)
                self.addCleanup(release.set)
                release.set()
                with self.assertRaises(kind) as caught:
                    futures[0].result(1)
                self.assertIs(caught.exception, failure)
                self.assertFalse(governor._polling)
                self.assertTrue(governor.stopped.is_set())
                self.assertIsNone(governor._count)
                self.assertEqual([f.result(1) for f in futures[1:]], [False] * 5)
                self.assertFalse(governor.admit())
                self.assertIsNotNone(governor.fatal_error)
                self.assertNotIn("private-poll-details", str(governor.fatal_error))
                measure.assert_called_once()

    def test_stale_refresh_blocks_every_caller_and_dates_success_at_completion(self):
        now = [100.0]
        release = threading.Event()
        target = client()
        target.session.get = Mock(return_value=response(body={"count": 0}))
        governor = admission.AdmissionGovernor(target.backlog_count, 10, 5)
        with patch.object(admission.time, "monotonic", side_effect=lambda: now[0]):
            self.assertTrue(governor.admit())
            now[0] += admission.POLL_INTERVAL_SECONDS

            def refresh(*args, **kwargs):
                self.assertTrue(release.wait(3))
                return response(body={"count": 0})

            target.session.get = Mock(side_effect=refresh)
            futures = self.start_waiters(governor)
            self.addCleanup(release.set)
            self.assertFalse(any(f.done() for f in futures))
            target.session.get.assert_called_once()
            # Slow HTTP must not exhaust freshness before the result is published.
            now[0] += admission.POLL_INTERVAL_SECONDS * 2
            release.set()
            self.assertEqual([f.result(3) for f in futures], [True] * 6)
            self.assertTrue(governor.admit())
            self.assertEqual(target.session.get.call_count, 2)

    def test_hysteresis_freshness_and_recovery(self):
        now = [100.0]
        outcomes = iter(
            [0, 10, 11, admission.StatusPollError("unavailable"), 8, 5, 11, 4]
        )
        poll = Mock(side_effect=lambda: next(outcomes))

        # Mock side_effect functions return exceptions; raise them explicitly.
        def measure():
            result = poll()
            if isinstance(result, Exception):
                raise result
            return result

        governor = admission.AdmissionGovernor(measure, 10, 5)
        waits = []

        def wait_for_refresh(delay):
            self.assertTrue(governor._paused)
            waits.append((poll.call_count, governor._count, delay))
            now[0] += delay

        with patch.object(
            admission.time, "monotonic", side_effect=lambda: now[0]
        ), patch.object(governor._condition, "wait", side_effect=wait_for_refresh):
            self.assertTrue(governor.admit())  # initial measured zero
            self.assertTrue(governor.admit())  # fresh successful cache
            self.assertEqual(poll.call_count, 1)
            now[0] += admission.POLL_INTERVAL_SECONDS
            self.assertTrue(governor.admit())  # exactly high stays open
            now[0] += admission.POLL_INTERVAL_SECONDS
            self.assertTrue(
                governor.admit()
            )  # high -> failure -> middle -> exactly low
            self.assertEqual(poll.call_count, 6)
            self.assertEqual(
                [(n, count) for n, count, _ in waits], [(3, 11), (4, None), (5, 8)]
            )
            now[0] += admission.POLL_INTERVAL_SECONDS
            self.assertTrue(governor.admit())  # below low also resumes
            self.assertEqual(poll.call_count, 8)

    def test_stale_open_measurement_cannot_admit_on_failure(self):
        now = [100.0]
        poll = Mock(side_effect=[0, admission.StatusPollError("unavailable"), 0])
        governor = admission.AdmissionGovernor(poll, 10, 5)

        def wait_for_retry(delay):
            self.assertIsNone(governor._count)
            self.assertEqual(poll.call_count, 2)
            now[0] += delay

        with patch.object(
            admission.time, "monotonic", side_effect=lambda: now[0]
        ), patch.object(
            governor._condition, "wait", side_effect=wait_for_retry
        ) as wait:
            self.assertTrue(governor.admit())
            now[0] += admission.POLL_INTERVAL_SECONDS
            self.assertTrue(governor.admit())
            wait.assert_called_once()
            self.assertEqual(poll.call_count, 3)

    def test_backoff_is_jittered_capped_nonzero_and_resets_after_success(self):
        now = [100.0]
        errors = [admission.StatusPollError("network") for _ in range(10)]
        poll = Mock(
            side_effect=errors
            + [
                admission.StatusPollError("throttled", retry_after=100),
                0,
                admission.StatusPollError("again"),
                0,
            ]
        )
        governor = admission.AdmissionGovernor(poll, 10, 5)
        delays = []

        def wait(delay):
            delays.append(delay)
            now[0] += delay

        with patch.object(
            admission.time, "monotonic", side_effect=lambda: now[0]
        ), patch.object(
            admission.random, "uniform", return_value=0.5
        ) as jitter, patch.object(
            governor._condition, "wait", side_effect=wait
        ):
            self.assertTrue(governor.admit())
            self.assertEqual(delays, [1, 2, 4, 8, 16, 30, 30, 30, 30, 30, 100])
            now[0] += admission.POLL_INTERVAL_SECONDS
            self.assertTrue(governor.admit())
            self.assertEqual(delays[-1], 1)
            jitter.assert_called_with(admission.JITTER_MIN, 1)

    def test_stop_during_backoff_or_high_pause(self):
        for result in (20, admission.StatusPollError("throttled", retry_after=300)):
            with self.subTest(result=result):
                poll = Mock(
                    side_effect=result if isinstance(result, Exception) else None,
                    return_value=result,
                )
                governor = admission.AdmissionGovernor(poll, 10, 5)
                futures = self.start_waiters(governor)
                governor.stop()
                self.assertEqual([f.result(1) for f in futures], [False] * 6)
                poll.assert_called_once()

    def test_disabled_and_watermark_validation(self):
        for high, low in ((0, -1), (-1, 100)):
            poll = Mock()
            governor = admission.AdmissionGovernor(poll, high, low)
            self.assertTrue(governor.admit())
            governor.stop()
            self.assertFalse(governor.admit())
            poll.assert_not_called()
        for high, low in ((10, -1), (10, 11)):
            with self.assertRaises(ValueError):
                admission.AdmissionGovernor(Mock(), high, low)


class RunAdmissionTests(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cfg = cli.Config(
            target_url="https://target.invalid",
            worker_token="private-token",
            corpus_id=None,
            root_dir=tmp.name,
            ledger_path=str(Path(tmp.name) / "ledger.sqlite3"),
            extensions=(".pdf",),
            max_workers=4,
            max_attempts=5,
            queue_high=10,
            queue_low=5,
            embeddings=False,
            target_folder_from_tree=True,
            verify_tls=True,
            limit=0,
            enrichers=[],
        )
        self.ledger = cli.Ledger(self.cfg.ledger_path)
        self.addCleanup(self.ledger._conn().close)
        for i in range(40):
            self.ledger.upsert_doc(f"{i:03}.pdf", f"/data/{i:03}.pdf", 1, "hash", 0)
        self.target = client()
        for name, value in (
            ("_Parser", Mock()),
            ("TargetClient", Mock(return_value=self.target)),
            ("Ledger", Mock(return_value=self.ledger)),
        ):
            patcher = patch.object(cli, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def assert_untouched(self):
        self.assertEqual(self.ledger.status_counts(), {cli.PENDING: 40})
        self.assertEqual(
            self.ledger._conn().execute("SELECT SUM(attempts) FROM docs").fetchone()[0],
            0,
        )

    def test_permanent_error_stops_run_without_document_attempts(self):
        for code in (401, 403, 400, 404):
            with self.subTest(code=code):
                self.target.session.get = Mock(return_value=response(code))
                with patch.object(cli, "_process_one") as process, self.assertLogs(
                    "oc_remote_ingest", level="ERROR"
                ) as logs, redirect_stdout(StringIO()):
                    self.assertEqual(cli.cmd_run(self.cfg), 2)
                process.assert_not_called()
                self.target.session.get.assert_called_once()
                self.assertIn(
                    (
                        "check --worker-token"
                        if code in (401, 403)
                        else "check --target-url"
                    ),
                    str(logs.output),
                )
                self.assertNotIn("private-token", str(logs.output))
                self.assert_untouched()

    def test_interrupt_during_initial_http_obeys_scheduler_drain(self):
        entered = threading.Event()
        release = threading.Event()
        self.addCleanup(release.set)

        def get(*args, **kwargs):
            entered.set()
            self.assertTrue(release.wait(3))
            return response(body={"count": 0})

        self.target.session.get = Mock(side_effect=get)

        def interrupt(*args, **kwargs):
            self.assertTrue(entered.wait(3))
            raise KeyboardInterrupt

        class DrainExecutor(ThreadPoolExecutor):
            def shutdown(self, *args, **kwargs):
                release.set()
                return super().shutdown(*args, **kwargs)

        with patch.object(cli, "ThreadPoolExecutor", DrainExecutor), patch.object(
            cli, "wait", interrupt
        ), patch.object(cli, "_process_one") as process, redirect_stdout(StringIO()):
            self.assertEqual(cli.cmd_run(self.cfg), 130)
        process.assert_not_called()
        self.assert_untouched()

    def test_poll_abort_stops_run_without_attempts_or_sensitive_diagnostics(self):
        for kind in (KeyboardInterrupt, SystemExit, GeneratorExit, BaseException):
            with self.subTest(kind=kind):
                release = threading.Event()
                self.addCleanup(release.set)

                def get(*args, **kwargs):
                    self.assertTrue(release.wait(3))
                    raise kind("private-poll-details")

                self.target.session.get = Mock(side_effect=get)
                original_wait = cli.wait

                def wait(*args, **kwargs):
                    # Exercise the scheduler's worker-exception logging path.
                    release.set()
                    return original_wait(*args, **kwargs)

                with patch.object(cli, "wait", wait), patch.object(
                    cli, "_process_one"
                ) as process, self.assertLogs(
                    "oc_remote_ingest", level="ERROR"
                ) as logs, redirect_stdout(
                    StringIO()
                ):
                    self.assertEqual(cli.cmd_run(self.cfg), 2)
                process.assert_not_called()
                self.target.session.get.assert_called_once()
                self.assertIn("Status polling aborted", str(logs.output))
                self.assertNotIn("private-poll-details", str(logs.output))
                self.assert_untouched()

    def test_disabled_run_never_polls_even_for_final_status(self):
        self.cfg.queue_high = 0
        self.target.session.get = Mock()

        def process(*args):
            return args[4]["rel_path"], True, "receipt"

        with patch.object(cli, "_process_one", side_effect=process), redirect_stdout(
            StringIO()
        ):
            self.assertEqual(cli.cmd_run(self.cfg), 0)
        self.target.session.get.assert_not_called()
        # Also cover an empty run's status summary.
        self.ledger._conn().execute("UPDATE docs SET status='COMPLETED'")
        with redirect_stdout(StringIO()):
            self.assertEqual(cli.cmd_run(self.cfg), 0)
        self.target.session.get.assert_not_called()

    def test_invalid_watermarks_fail_before_initialization(self):
        for low in (-1, 11):
            self.cfg.queue_low = low
            with patch.object(cli, "_Parser") as parser, self.assertLogs(
                "oc_remote_ingest", level="ERROR"
            ):
                self.assertEqual(cli.cmd_run(self.cfg), 2)
            parser.assert_not_called()
        with redirect_stdout(StringIO()), patch(
            "sys.stderr", StringIO()
        ), self.assertRaises(SystemExit) as caught:
            cli.main(["run", "--queue-high", "1", "--queue-low", "2"])
        self.assertEqual(caught.exception.code, 2)

    def test_permanent_summary_error_also_returns_nonzero_for_empty_run(self):
        self.ledger._conn().execute("UPDATE docs SET status='COMPLETED'")
        self.target.session.get = Mock(return_value=response(403))
        with redirect_stdout(StringIO()), patch.object(cli, "_process_one") as process:
            self.assertEqual(cli.cmd_run(self.cfg), 2)
        process.assert_not_called()

    def test_status_command_propagates_permanent_configuration_errors(self):
        for code in (401, 403, 400, 404, 302, 429, 503, 200):
            with self.subTest(code=code):
                self.target.session.get = Mock(
                    return_value=response(code, body={"count": 0})
                )
                with redirect_stdout(StringIO()):
                    self.assertEqual(
                        cli.cmd_status(self.cfg),
                        0 if code in (429, 503, 200) else 2,
                    )

        self.cfg.worker_token = ""
        self.target.session.get.reset_mock()
        with redirect_stdout(StringIO()):
            self.assertEqual(cli.cmd_status(self.cfg), 0)
        self.target.session.get.assert_not_called()
