"""Pipeline components must not log raw kwargs dicts.

Component kwargs are merged from pipeline settings, which include decrypted
secrets (API keys for parser and embedder services). Interpolating such a dict
into a log message writes the secret to the log stream, so every log call that
formats a ``*kwargs`` variable must wrap it in ``redact_sensitive_kwargs``.
"""

import ast
import logging
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase

import opencontractserver.pipeline as pipeline_pkg

PIPELINE_DIR = Path(pipeline_pkg.__file__).parent
LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical", "log"}


def _unredacted_kwargs_in_log_calls(source: str) -> list[tuple[int, str]]:
    """Return (line, name) for each ``*kwargs`` name formatted raw in a log call."""
    hits = []
    for node in ast.walk(ast.parse(source)):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in LOG_METHODS
        ):
            continue
        for arg in node.args:
            for part in ast.walk(arg):
                if not isinstance(part, ast.FormattedValue):
                    continue
                value = part.value
                if isinstance(value, ast.Name) and value.id.endswith("kwargs"):
                    hits.append((part.lineno, value.id))
    return hits


class PipelineLogRedactionTest(SimpleTestCase):
    def test_no_pipeline_log_call_formats_raw_kwargs(self):
        offenders = []
        for path in sorted(PIPELINE_DIR.rglob("*.py")):
            for line, name in _unredacted_kwargs_in_log_calls(path.read_text()):
                offenders.append(f"{path.relative_to(PIPELINE_DIR)}:{line} {name}")
        self.assertEqual(
            offenders,
            [],
            "Wrap these in redact_sensitive_kwargs() before logging: "
            + ", ".join(offenders),
        )

    def test_detector_flags_raw_and_allows_redacted(self):
        raw = 'logger.debug(f"kwargs: {all_kwargs}")'
        redacted = 'logger.debug(f"kwargs: {redact_sensitive_kwargs(all_kwargs)}")'
        self.assertEqual(_unredacted_kwargs_in_log_calls(raw), [(1, "all_kwargs")])
        self.assertEqual(_unredacted_kwargs_in_log_calls(redacted), [])

    def test_microservice_embedder_does_not_log_api_key(self):
        from opencontractserver.pipeline.embedders.sent_transformer_microservice import (  # noqa: E501
            MicroserviceEmbedder,
        )

        secret = "test-secret-value-1234567890"
        embedder = MicroserviceEmbedder()
        with mock.patch(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice"
            "._get_session",
            side_effect=RuntimeError("no network in tests"),
        ), self.assertLogs(
            "opencontractserver.pipeline.embedders.sent_transformer_microservice",
            level=logging.DEBUG,
        ) as logs:
            embedder._embed_text_impl(
                "hello",
                embeddings_microservice_url="http://embedder.invalid",
                vector_embedder_api_key=secret,
            )
        joined = "\n".join(logs.output)
        self.assertIn("Effective kwargs", joined)
        self.assertNotIn(secret, joined)
