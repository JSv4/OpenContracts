"""Local, content-verified preparation checkpoints; no receipt or HTTP semantics.

One CLI invocation owns a ledger. Each document has a small manifest and at most
three referenced JSON artifacts. Writers fsync artifacts before publishing their
references; readers validate both the content digest and the stage contract.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import os
import tempfile
import time
from functools import lru_cache
from pathlib import Path

STAGES = ("parse", "enrich", "embed")
VERSION = 1
DEFAULT_ARTIFACT_RETENTION_SECONDS = 24 * 60 * 60


def json_bytes(value) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fingerprint(value) -> str:
    # Effective settings (including credentials) exist only in memory. Persist
    # only this opaque digest, never configuration or HTTP headers/URLs.
    return digest(json_bytes(value))


@lru_cache(maxsize=128)
def implementation_digest(component) -> str:
    """Hash implementation modules, including inherited parser operations.

    External models, imported helpers and data still need operator identities.
    Read once per process so hashing does not grow with document count.
    """
    classes = component.__mro__[:-1] if inspect.isclass(component) else (component,)
    paths = {inspect.getsourcefile(cls) for cls in classes}
    return fingerprint(
        [digest(Path(path).read_bytes()) for path in sorted(p for p in paths if p)]
    )


def _atomic_write(path: Path, data: bytes) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Checkpoints:
    def __init__(self, ledger_path: str, rel_path: str, *, create: bool = True):
        root = Path(ledger_path + ".artifacts")
        self.path = root / digest(rel_path.encode("utf-8"))
        # Parent directory entries must also survive a host restart.
        for directory in (root, self.path) if create else ():
            if not directory.exists():
                directory.mkdir(mode=0o700, exist_ok=True)
                fd = os.open(directory.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
        self.manifest_path = self.path / "manifest.json"
        self.manifest = self._read_manifest()

    def _read_manifest(self) -> dict:
        try:
            manifest = json.loads(self.manifest_path.read_bytes())
            if (
                manifest["version"] == VERSION
                and isinstance(manifest["stages"], dict)
                and not manifest["stages"].keys() - set(STAGES)
                and all(
                    isinstance(entry, dict)
                    and set(entry) == {"key", "digest"}
                    and all(
                        isinstance(value, str)
                        and len(value) == 64
                        and all(c in "0123456789abcdef" for c in value)
                        for value in entry.values()
                    )
                    for entry in manifest["stages"].values()
                )
            ):
                return manifest
        except (OSError, ValueError, KeyError, TypeError):
            pass
        return {"version": VERSION, "stages": {}}

    def _publish(self):
        _atomic_write(self.manifest_path, json_bytes(self.manifest))

    def stage(self, name: str, inputs, prepare, validate):
        """Return a JSON-round-tripped artifact and its digest on hit AND miss.

        Always drop dependent references on a miss, even when recomputation
        happens to produce the old digest. Partial/invalid work never commits.
        """
        key = fingerprint([VERSION, name, inputs])
        entry = self.manifest["stages"].get(name)
        if entry and entry["key"] == key:
            try:
                data = (self.path / (entry["digest"] + ".json")).read_bytes()
                if digest(data) == entry["digest"]:
                    value = json.loads(data)
                    validate(value)
                    return value, entry["digest"]
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                pass
        for downstream in STAGES[STAGES.index(name) :]:
            self.manifest["stages"].pop(downstream, None)
        self._publish()
        value = prepare()
        validate(value)
        data = json_bytes(value)
        value = json.loads(data)
        validate(value)  # JSON key coercion must not change the export contract.
        artifact_digest = digest(data)
        _atomic_write(self.path / (artifact_digest + ".json"), data)
        self.manifest["stages"][name] = {"key": key, "digest": artifact_digest}
        self._publish()
        return value, artifact_digest

    def prune(self, older_than: float = DEFAULT_ARTIFACT_RETENTION_SECONDS) -> int:
        """Offline cleanup: keep every referenced artifact, regardless of row state.

        An unreadable manifest is not evidence that artifacts are unreferenced;
        leave that directory alone until run repairs it. Traverse one directory
        at a time, never collect a ledger-wide set of hashes or paths.
        Manifest rechecks are not a lock: concurrent publication/deletion after
        the check is unsafe. No other command may own this ledger during cleanup.
        """
        if not self.manifest_path.exists() or self._read_manifest() != self.manifest:
            return 0
        # A malformed manifest also reads as an empty one; require exact validity.
        try:
            if json.loads(self.manifest_path.read_bytes()) != self.manifest:
                return 0
        except (OSError, ValueError):
            return 0
        keep = {e["digest"] + ".json" for e in self.manifest["stages"].values()}
        removed = 0
        cutoff = time.time() - older_than
        with os.scandir(self.path) as entries:
            for entry in entries:
                if (
                    entry.name != "manifest.json"
                    and entry.name not in keep
                    and entry.is_file(follow_symlinks=False)
                    and entry.stat().st_mtime < cutoff
                ):
                    os.unlink(entry.path)
                    removed += 1
        return removed
