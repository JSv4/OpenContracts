"""Log calls must not format raw kwargs / settings mappings — pytest enforcement.

Pipeline component kwargs are merged from ``PipelineSettings``, which carries
decrypted component secrets (API keys for parser and embedder services), and
the same mappings flow on into tasks, LLM tooling and MCP code. Interpolating
such a mapping into a log message writes the secret to the log stream, so a
log call may only format it through
``opencontractserver.utils.logging.redact_sensitive_kwargs``.

Scope: every ``*.py`` under ``opencontractserver/`` and ``config/``, tests
included. A file is parsed only when its text could hold a hit (a
``kwargs``/``settings`` name plus a logging-method call), which is lossless
and keeps the scan to ~200 files.

What the scanner catches: an expression that *names* a kwargs/settings
mapping — a bare name (``all_kwargs``), an attribute (``self._settings``) or
a call (``self.get_component_settings()``) — formatted into a log call via an
f-string, a ``%``-style positional argument, ``str.format`` or the ``%``
operator, optionally wrapped in ``str``/``repr``/``dict``/``json.dumps``/
``pprint.pformat``.

Known limits, by design — widen when a real case shows up:

* Detection is name-based. A secret-bearing dict under an unrelated name
  (``opts``, ``headers``, ``payload``) is not flagged.
* Transformed expressions (``all_kwargs.get("height")``,
  ``list(all_kwargs)``, ``len(all_kwargs)``) are not flagged, so a scalar
  lookup or key listing can be logged without redaction.
* ``redact_sensitive_kwargs`` itself matches *key names*
  (``SENSITIVE_KEY_PATTERNS``); a secret stored under an unusual key such as
  ``{"auth": ("user", "pass")}`` passes through un-redacted.
* Only ``logging``-style method calls (``logger.info`` …) are inspected;
  ``print`` and ``warnings.warn`` are not.
"""

from __future__ import annotations

import ast
import logging
import re
from collections.abc import Iterator
from pathlib import Path
from unittest import mock

import pytest

import config as config_pkg
import opencontractserver as backend_pkg

SCAN_ROOTS = (
    Path(backend_pkg.__file__).resolve().parent,
    Path(config_pkg.__file__).resolve().parent,
)
REPO_ROOT = SCAN_ROOTS[0].parent

LOG_METHODS = {"debug", "info", "warning", "error", "exception", "critical", "log"}
REDACTOR = "redact_sensitive_kwargs"
SENSITIVE_NAME_SUFFIXES = ("kwargs", "settings")
# Wrappers that render the mapping as-is, so the secret still reaches the log.
TRANSPARENT_WRAPPERS = {"str", "repr", "dict", "pformat", "dumps"}

_LOG_CALL_RE = re.compile(r"\.(" + "|".join(LOG_METHODS) + r")\(")

EMBEDDER_MODULE = "opencontractserver.pipeline.embedders.sent_transformer_microservice"


def _expr_name(node: ast.AST) -> str | None:
    """The identifier an expression is named by: ``x``, ``a.x`` or ``x(...)``."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Call):
        return _expr_name(node.func)
    return None


def _unwrap_transparent(node: ast.expr) -> ast.expr:
    while (
        isinstance(node, ast.Call)
        and len(node.args) == 1
        and _expr_name(node.func) in TRANSPARENT_WRAPPERS
    ):
        node = node.args[0]
    return node


def _raw_sensitive_name(node: ast.expr) -> str | None:
    """Return the offending name if ``node`` formats an unredacted mapping."""
    node = _unwrap_transparent(node)
    if isinstance(node, ast.Call) and _expr_name(node.func) == REDACTOR:
        return None
    name = _expr_name(node)
    if name and name.lower().endswith(SENSITIVE_NAME_SUFFIXES):
        return name
    return None


def _formatted_exprs(call: ast.Call) -> Iterator[ast.expr]:
    """Every expression whose value ends up in the logged message."""
    for index, arg in enumerate(call.args):
        if index > 0:  # %-style positional: logger.info("... %s", x)
            yield arg
        for part in ast.walk(arg):
            if isinstance(part, ast.FormattedValue):  # f"{x}"
                yield part.value
            elif (
                isinstance(part, ast.Call)
                and isinstance(part.func, ast.Attribute)
                and part.func.attr == "format"
            ):  # "{}".format(x) / "{k}".format(k=x)
                yield from part.args
                yield from (kw.value for kw in part.keywords)
            elif isinstance(part, ast.BinOp) and isinstance(part.op, ast.Mod):
                right = part.right  # "%s" % x / "%s %s" % (a, x)
                yield from right.elts if isinstance(right, ast.Tuple) else (right,)


def scan_log_calls(source: str) -> list[tuple[int, str]]:
    """Return ``(line, name)`` for each raw kwargs/settings mapping in a log call."""
    hits: list[tuple[int, str]] = []
    for node in ast.walk(ast.parse(source)):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in LOG_METHODS
        ):
            continue
        for expr in _formatted_exprs(node):
            name = _raw_sensitive_name(expr)
            if name:
                hits.append((expr.lineno, name))
    return hits


def _may_contain_hit(source: str) -> bool:
    """Lossless text pre-filter: a hit needs a sensitive name and a log call."""
    return any(s in source for s in SENSITIVE_NAME_SUFFIXES) and bool(
        _LOG_CALL_RE.search(source)
    )


def iter_candidate_modules() -> Iterator[tuple[Path, str]]:
    for root in SCAN_ROOTS:
        for path in sorted(root.rglob("*.py")):
            source = path.read_text(encoding="utf-8")
            if _may_contain_hit(source):
                yield path, source


def test_no_backend_log_call_formats_raw_kwargs_or_settings() -> None:
    offenders = [
        f"{path.relative_to(REPO_ROOT)}:{line} {name}"
        for path, source in iter_candidate_modules()
        for line, name in scan_log_calls(source)
    ]
    assert offenders == [], (
        "Wrap these in redact_sensitive_kwargs() before logging "
        "(or log a scalar / the key list instead):\n  " + "\n  ".join(offenders)
    )


FLAGGED = {
    "f-string": ('logger.debug(f"kwargs: {all_kwargs}")', "all_kwargs"),
    "percent-positional": ('logger.info("kwargs: %s", all_kwargs)', "all_kwargs"),
    "percent-operator": (
        'logger.info("a %s b %s" % (x, merged_kwargs))',
        "merged_kwargs",
    ),
    "str.format": (
        'logger.info("s: {}".format(component_settings))',
        "component_settings",
    ),
    "str.format-keyword": (
        'logger.info("s: {s}".format(s=component_settings))',
        "component_settings",
    ),
    "method-call": (
        'logger.info(f"s: {self.get_component_settings()}")',
        "get_component_settings",
    ),
    "attribute": ('logger.warning(f"s: {self._settings}")', "_settings"),
    "str-wrapped": ('logger.info("s: %s", str(all_kwargs))', "all_kwargs"),
    "json.dumps-wrapped": ('logger.info(f"s: {json.dumps(all_kwargs)}")', "all_kwargs"),
    "logger.log": ('logger.log(logging.INFO, "k: %s", all_kwargs)', "all_kwargs"),
    "nested-f-string": ('logger.info(" ".join([f"{all_kwargs}"]))', "all_kwargs"),
}

ALLOWED = {
    "redacted-f-string": 'logger.debug(f"kwargs: {redact_sensitive_kwargs(all_kwargs)}")',
    "redacted-percent": 'logger.info("k: %s", redact_sensitive_kwargs(all_kwargs))',
    "scalar-lookup": """logger.info(f"h: {all_kwargs.get('height')}")""",
    "keys-only": 'logger.info(f"h: {list(all_kwargs.keys())}")',
    "django-settings-attr": 'logger.info(f"x: {settings.DEBUG}")',
    "exception-variable": 'logger.debug(f"Could not load settings: {e}")',
    "not-a-log-call": "print(all_kwargs)",
}


@pytest.mark.parametrize("snippet,name", FLAGGED.values(), ids=FLAGGED.keys())
def test_scanner_flags_raw_mapping(snippet: str, name: str) -> None:
    assert scan_log_calls(snippet) == [(1, name)]


@pytest.mark.parametrize("snippet", ALLOWED.values(), ids=ALLOWED.keys())
def test_scanner_allows_safe_formatting(snippet: str) -> None:
    assert scan_log_calls(snippet) == []


def test_prefilter_keeps_every_flagged_snippet() -> None:
    """The text pre-filter must never skip a file the AST scan would flag."""
    assert all(_may_contain_hit(snippet) for snippet, _ in FLAGGED.values())


def test_microservice_embedder_does_not_log_api_key(
    caplog: pytest.LogCaptureFixture,
) -> None:
    from opencontractserver.pipeline.embedders.sent_transformer_microservice import (  # noqa: E501
        MicroserviceEmbedder,
    )

    secret = "test-secret-value-1234567890"
    service_settings = {
        "embeddings_microservice_url": "http://embedder.invalid",
        "vector_embedder_api_key": secret,
    }
    # Explicit component_settings is the documented no-database construction
    # path; without it the constructor only stays off the DB because
    # get_component_settings() swallows the test runner's access error.
    embedder = MicroserviceEmbedder(component_settings=service_settings)
    with mock.patch(
        f"{EMBEDDER_MODULE}._get_session",
        side_effect=RuntimeError("no network in tests"),
    ), caplog.at_level(logging.DEBUG, logger=EMBEDDER_MODULE):
        embedder._embed_text_impl("hello", **service_settings)

    joined = "\n".join(record.getMessage() for record in caplog.records)
    assert "Effective kwargs" in joined
    assert secret not in joined


def test_agent_config_repr_hides_api_key() -> None:
    """``AgentConfig`` is logged whole at DEBUG; its key must stay out of repr."""
    from opencontractserver.llms.agents.core_agents import AgentConfig

    secret = "sk-test-1234567890"
    config = AgentConfig(api_key=secret)
    assert config.api_key == secret
    assert secret not in repr(config)
