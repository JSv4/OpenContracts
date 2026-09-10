"""Bounded remote CLI tests: generated paths/SQLite rows, no Django or services.

Can also run directly with ``python -m unittest
opencontractserver.tests.test_remote_ingest_scheduling``.
"""

import hashlib
import os
import sqlite3
import threading
import time
import unittest
import weakref
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import closing
from dataclasses import replace
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import Mock, patch

from scripts.remote_ingest import oc_remote_ingest as cli


class ObservedCursor(sqlite3.Cursor):
    def execute(self, sql, parameters=()):
        self.sql = sql
        if sql.startswith("SELECT * FROM docs"):
            observer = cast(ObservedConnection, self.connection).observer
            observer["test"].assertFalse(observer["interrupted"])
            observer["queries"].append((sql, parameters))
        return super().execute(sql, parameters)

    def fetchmany(self, size=1):
        rows = super().fetchmany(size)
        cast(ObservedConnection, self.connection).observer["fetches"].append(
            (size, len(rows))
        )
        return rows

    def fetchall(self):
        if self.sql.startswith("SELECT * FROM docs"):
            raise AssertionError("document reads must be bounded")
        return super().fetchall()


class ObservedConnection(sqlite3.Connection):
    observer: dict[str, Any]

    def execute(self, sql, parameters=()):
        return self.cursor(ObservedCursor).execute(sql, parameters)


class SchedulingTests(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.cfg = cli.Config(
            target_url="https://target.invalid",
            worker_token="test-token",
            corpus_id=None,
            root_dir=tmp.name,
            ledger_path=str(self.root / "ledger.sqlite3"),
            extensions=(".pdf",),
            max_workers=3,
            max_attempts=5,
            queue_high=0,
            queue_low=0,
            embeddings=False,
            target_folder_from_tree=True,
            verify_tls=True,
            limit=0,
            enrichers=[],
            ledger_page_size=7,
        )
        self.observer: dict[str, Any] = dict(
            test=self, interrupted=False, queries=[], fetches=[]
        )
        connect = sqlite3.connect
        coordinator = threading.get_ident()

        def observed_connect(*args, **kwargs):
            conn = connect(*args, **kwargs, factory=ObservedConnection)
            conn.observer = self.observer
            if threading.get_ident() == coordinator:
                self.addCleanup(conn.close)
            return conn

        self.patch("sqlite3.connect", observed_connect)
        self.ledger = cli.Ledger(self.cfg.ledger_path)
        self.patch("scripts.remote_ingest.oc_remote_ingest._Parser", Mock())
        self.client = Mock()
        self.client.backlog_count.return_value = 0
        self.patch(
            "scripts.remote_ingest.oc_remote_ingest.TargetClient",
            Mock(return_value=self.client),
        )
        self.patch("scripts.remote_ingest.oc_remote_ingest._print_status", Mock())
        self.patch("scripts.remote_ingest.oc_remote_ingest.logger", Mock())
        self.patch("sys.stderr", StringIO())

    def patch(self, target, value):
        patcher = patch(target, value)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def populate(self, count, statuses=(cli.PENDING, cli.FAILED)):
        # Reverse insertion order ensures traversal uses the key, not insertion order.
        with self.ledger._conn() as conn:
            conn.executemany(
                "INSERT INTO docs(rel_path, abs_path, status, upload_id) VALUES(?, ?, ?, ?)",
                (
                    (
                        f"{i:05}.pdf",
                        f"/generated/{i}.pdf",
                        statuses[i % len(statuses)],
                        f"receipt-{i}",
                    )
                    for i in reversed(range(count))
                ),
            )

    def uploaded(self, row, ledger, receipt="receipt"):
        # A successful _process_one now owns receipt persistence before returning.
        ledger.mark_uploaded(row["rel_path"], receipt, 1, 1)
        return row["rel_path"], True, receipt

    def assert_pages_bounded(self, page_size, minimum_pages=2):
        self.assertGreaterEqual(len(self.observer["fetches"]), minimum_pages)
        for requested, fetched in self.observer["fetches"]:
            self.assertEqual(requested, page_size)
            self.assertLessEqual(fetched, page_size)
        for sql, params in self.observer["queries"]:
            self.assertNotIn("OFFSET", sql)
            self.assertIn("LIMIT ?", sql)
            self.assertEqual(params[-1], page_size)
            plan = (
                self.ledger._conn()
                .execute("EXPLAIN QUERY PLAN " + sql, params)
                .fetchall()
            )
            self.assertFalse(any("TEMP B-TREE" in row[3] for row in plan))

    def test_keyset_transitions_and_retry_next_pass(self):
        self.populate(1003, (cli.PENDING, cli.FAILED, cli.COMPLETED, cli.PARKED))
        expected = [f"{i:05}.pdf" for i in range(1003) if i % 4 < 2]
        self.assertEqual(self.ledger.claimable_count(), len(expected))
        selected = []
        for row in self.ledger.claimable(7):
            rel = row["rel_path"]
            selected.append(rel)
            if int(rel[:5]) % 4 == 0:
                self.ledger.mark_uploaded(rel, "accepted", 1, 1)
            else:
                self.ledger.mark_failed(rel, "retry later", 5)
        self.assertEqual(selected, expected)
        retry = [row["rel_path"] for row in self.ledger.claimable(7)]
        self.assertEqual(retry, [rel for rel in expected if int(rel[:5]) % 4 == 1])
        self.assert_pages_bounded(7, minimum_pages=100)

    def test_run_bounds_futures_and_releases_completed_work(self):
        self.populate(1003)
        window = cli.FUTURES_PER_WORKER * self.cfg.max_workers
        live: weakref.WeakSet[Future[None]] = weakref.WeakSet()
        peaks = dict(unfinished=0, retained=0, submitted=0)
        release = threading.Event()
        self.addCleanup(release.set)
        attempts = []
        test = self

        class ObservedExecutor(ThreadPoolExecutor):
            def submit(self, *args, **kwargs):
                future = super().submit(*args, **kwargs)
                live.add(future)
                peaks["submitted"] += 1
                peaks["unfinished"] = max(
                    peaks["unfinished"], sum(not f.done() for f in live)
                )
                peaks["retained"] = max(peaks["retained"], len(live))
                test.assertLessEqual(peaks["unfinished"], window)
                return future

        def process(cfg, parser, embedder, client, row, enrichers, ledger):
            self.assertTrue(
                release.wait(3), "coordinator did not reach its bounded window"
            )
            rel = row["rel_path"]
            attempts.append(rel)
            if rel == "00000.pdf":
                return rel, False, "failed"
            return self.uploaded(row, ledger)

        real_wait = cli.wait

        def observed_wait(futures, **kwargs):
            self.assertLessEqual(len(futures), window)
            release.set()
            return real_wait(futures, **kwargs)

        with patch.object(cli, "ThreadPoolExecutor", ObservedExecutor), patch.object(
            cli, "wait", observed_wait
        ), patch.object(cli, "_process_one", process):
            self.assertEqual(cli.cmd_run(self.cfg), 1)
        self.assertEqual(sorted(attempts), [f"{i:05}.pdf" for i in range(1003)])
        self.assertEqual(peaks["submitted"], 1003)
        self.assertEqual(peaks["unfinished"], window)
        self.assertLessEqual(peaks["retained"], window)
        self.assertEqual(len(live), 0)
        self.assert_pages_bounded(7, minimum_pages=100)
        self.assertEqual(self.ledger.claimable_count(), 1)
        with patch.object(
            cli,
            "_process_one",
            side_effect=lambda *args: self.uploaded(args[4], args[6], "retried"),
        ) as process:
            self.assertEqual(cli.cmd_run(self.cfg), 0)
            process.assert_called_once()
        self.assertEqual(self.ledger.status_counts(), {cli.UPLOADED: 1003})

    def test_verify_pages_keep_terminal_and_outstanding_outcomes(self):
        self.populate(1003, (cli.UPLOADED,))
        self.ledger._conn().execute(
            "UPDATE docs SET upload_id=NULL WHERE rel_path='01002.pdf'"
        )
        self.assertEqual(self.ledger.uploaded_unconfirmed_count(), 1002)
        selected = []
        outcomes = ["COMPLETED", "FAILED", "PENDING", "PROCESSING", None]

        def status(receipt):
            i = int(receipt.split("-")[1])
            selected.append(i)
            outcome = outcomes[i % len(outcomes)]
            return (
                None
                if outcome is None
                else {"status": outcome, "error_message": "server error"}
            )

        self.client.upload_status.side_effect = status
        self.assertEqual(cli.cmd_verify(self.cfg), 0)
        self.assertEqual(selected, list(range(1002)))
        self.assert_pages_bounded(7, minimum_pages=100)
        failed = (
            self.ledger._conn()
            .execute("SELECT * FROM docs WHERE rel_path='00001.pdf'")
            .fetchone()
        )
        self.assertEqual(
            (failed["status"], failed["upload_id"], failed["last_error"]),
            (cli.FAILED, "receipt-1", "server: server error"),
        )
        selected.clear()
        cli.cmd_verify(self.cfg)
        self.assertEqual(selected, [i for i in range(1002) if i % len(outcomes) >= 2])

    def test_interrupt_wakes_paused_workers_cancels_queue_and_resumes(self):
        self.populate(103)
        cfg = replace(self.cfg, max_workers=1, queue_high=10)
        polled = threading.Event()
        queued = []
        test = self

        def backlog():
            polled.set()
            return 20

        self.client.backlog_count.side_effect = backlog

        class ObservedExecutor(ThreadPoolExecutor):
            def submit(self, *args, **kwargs):
                test.assertFalse(test.observer["interrupted"])
                future = super().submit(*args, **kwargs)
                queued.append(future)
                return future

        def interrupt(futures, **kwargs):
            self.assertTrue(polled.wait(3))
            self.observer["interrupted"] = True
            raise KeyboardInterrupt

        start = time.monotonic()
        with patch.object(cli, "wait", interrupt), patch.object(
            cli, "ThreadPoolExecutor", ObservedExecutor
        ), patch.object(cli, "_process_one") as process:
            self.assertEqual(cli.cmd_run(cfg), 130)
            process.assert_not_called()
        self.assertLess(time.monotonic() - start, 3)
        self.assertEqual(len(queued), 2)
        self.assertTrue(queued[1].cancelled())
        self.assertEqual(len(self.observer["fetches"]), 1)
        self.assertEqual(self.ledger.claimable_count(), 103)
        self.assertEqual(
            self.ledger._conn().execute("SELECT SUM(attempts) FROM docs").fetchone()[0],
            0,
        )
        self.observer["interrupted"] = False
        with patch.object(
            cli,
            "_process_one",
            side_effect=lambda *args: self.uploaded(args[4], args[6]),
        ):
            self.assertEqual(cli.cmd_run(self.cfg), 0)
        self.assertEqual(self.ledger.status_counts(), {cli.UPLOADED: 103})

    def test_interrupt_preserves_running_success_and_failure(self):
        self.populate(103)
        cfg = replace(self.cfg, max_workers=2)
        started = threading.Barrier(3)
        release = threading.Event()
        self.addCleanup(release.set)
        queued = []
        test = self

        class ObservedExecutor(ThreadPoolExecutor):
            def submit(self, *args, **kwargs):
                test.assertFalse(test.observer["interrupted"])
                future = super().submit(*args, **kwargs)
                queued.append(future)
                return future

            def shutdown(self, wait=True, *, cancel_futures=False):
                test.assertTrue(all(f.cancelled() for f in queued[2:]))
                release.set()
                return super().shutdown(wait, cancel_futures=cancel_futures)

        def process(*args):
            started.wait(timeout=3)
            self.assertTrue(release.wait(3))
            rel = args[4]["rel_path"]
            if rel == "00000.pdf":
                return self.uploaded(args[4], args[6], "accepted")
            return rel, False, "failed"

        def interrupt(*args, **kwargs):
            started.wait(timeout=3)
            self.observer["interrupted"] = True
            raise KeyboardInterrupt

        with patch.object(cli, "wait", interrupt), patch.object(
            cli, "ThreadPoolExecutor", ObservedExecutor
        ), patch.object(cli, "_process_one", process):
            self.assertEqual(cli.cmd_run(cfg), 130)
        self.assertEqual(len(queued), 4)
        self.assertTrue(all(f.done() for f in queued))
        self.assertEqual(self.ledger.claimable_count(), 102)
        self.observer["interrupted"] = False
        failed = next(self.ledger.claimable(7))
        self.assertEqual(
            (failed["rel_path"], failed["status"], failed["attempts"]),
            ("00001.pdf", cli.FAILED, 1),
        )
        resumed = []

        def resume(*args):
            rel = args[4]["rel_path"]
            resumed.append(rel)
            return self.uploaded(args[4], args[6], "resumed")

        with patch.object(cli, "_process_one", resume):
            self.assertEqual(cli.cmd_run(cfg), 0)
        self.assertEqual(sorted(resumed), [f"{i:05}.pdf" for i in range(1, 103)])

    def test_positive_bounds_and_empty_passes(self):
        for flag in ("--max-workers", "--ledger-page-size"):
            for value in ("0", "-1"):
                with self.subTest(flag=flag, value=value), self.assertRaises(
                    SystemExit
                ) as exc:
                    cli.main([flag, value, "status"])
                self.assertEqual(exc.exception.code, 2)
        with self.assertRaises(ValueError):
            next(self.ledger.claimable(0))
        with patch.object(cli, "ThreadPoolExecutor") as pool:
            self.assertEqual(cli.cmd_run(self.cfg), 0)
            pool.assert_not_called()
        self.assertEqual(cli.cmd_verify(self.cfg), 0)
        self.client.upload_status.assert_not_called()

    def synthetic_tree(self, names):
        """Lazy directory handles explode if a caller scans beyond the limit."""
        sub = self.root / "sub"
        sub.mkdir()
        for name in names:
            (sub / name).write_bytes(name.encode())
        handles = []

        class Directory:
            def __init__(self, entries):
                self.entries = iter(entries)
                self.consumed = 0
                self.closed = False

            def __next__(self):
                self.consumed += 1
                return next(self.entries)

            def close(self):
                self.closed = True

        def entries(path):
            for child in (
                [sub] if Path(path) == self.root else [sub / name for name in names]
            ):
                yield SimpleNamespace(
                    path=str(child),
                    is_dir=lambda **kwargs: child.is_dir(),
                    is_file=child.is_file,
                )
            raise AssertionError("consumed the rest of the synthetic tree")

        def scandir(path):
            handle = Directory(entries(path))
            handles.append(handle)
            return handle

        return scandir, handles

    def test_scanner_yields_before_consuming_wide_or_deep_tree(self):
        scandir, handles = self.synthetic_tree(["first.PDF"])
        with patch.object(cli.os, "scandir", scandir), closing(
            cli._scan(str(self.root), (".pdf",))
        ) as paths:
            rel, absolute = next(paths)
            self.assertEqual(rel, "sub/first.PDF")
            self.assertEqual(absolute, str(self.root / "sub/first.PDF"))
            self.assertEqual([handle.consumed for handle in handles], [1, 1])
        self.assertTrue(all(handle.closed for handle in handles))

    def test_plan_limit_counts_new_documents_and_closes_scan(self):
        scandir, handles = self.synthetic_tree(["old.PDF", "new.PDF"])
        self.ledger.upsert_doc(
            "sub/old.PDF", str(self.root / "sub/old.PDF"), 7, "old-hash", 1
        )
        with patch.object(cli.os, "scandir", scandir):
            self.assertEqual(cli.cmd_plan(replace(self.cfg, limit=1)), 0)
        rows = {row["rel_path"]: row for row in self.ledger.claimable(7)}
        self.assertEqual(set(rows), {"sub/old.PDF", "sub/new.PDF"})
        self.assertEqual(
            rows["sub/old.PDF"]["sha256"], hashlib.sha256(b"old.PDF").hexdigest()
        )
        self.assertEqual(
            rows["sub/new.PDF"]["sha256"], hashlib.sha256(b"new.PDF").hexdigest()
        )
        self.assertEqual(rows["sub/new.PDF"]["size"], 7)
        self.assertEqual([handle.consumed for handle in handles], [1, 2])
        self.assertTrue(all(handle.closed for handle in handles))

    def test_cleanup_traversal_uses_bounded_pages_and_preserves_every_status(self):
        from scripts.remote_ingest.checkpoints import Checkpoints

        self.populate(
            75,
            statuses=(
                cli.PENDING,
                cli.FAILED,
                cli.PARKED,
                cli.UPLOADED,
                cli.COMPLETED,
                cli.AMBIGUOUS,
                cli.CONFLICT,
            ),
        )
        visited = []

        def prune(cache):
            visited.append(cache.path.name)
            self.assertFalse(cache.path.exists())  # no caches created by cleanup
            return 0

        with patch.object(Checkpoints, "prune", prune):
            self.assertEqual(cli.cmd_cleanup(self.cfg), 0)
        self.assertEqual(len(set(visited)), 75)
        self.assert_pages_bounded(self.cfg.ledger_page_size)

    def test_scanner_extensions_links_and_posix_paths(self):
        (self.root / "nested").mkdir()
        for name in ("a.PDF", "nested/b.txt", "c.docx", "skip.csv"):
            (self.root / name).touch()
        (self.root / "directory.pdf").mkdir()
        os.symlink(self.root / "a.PDF", self.root / "linked.pdf")
        os.symlink(self.root, self.root / "nested" / "cycle")
        os.symlink(self.root / "missing", self.root / "broken.pdf")
        self.assertEqual(
            {rel for rel, _ in cli._scan(str(self.root), (".pdf", ".txt", ".docx"))},
            {"a.PDF", "nested/b.txt", "c.docx", "linked.pdf"},
        )
