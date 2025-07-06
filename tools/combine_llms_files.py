from __future__ import annotations

"""Utility to concatenate all files under opencontractserver/llms into one text file.

The output file is created alongside this script and named ``llms_files_contents.txt``.
Each file is wrapped in an XML-like block of the form::

    <FILE path="opencontractserver/llms/example.py">
    ... file content ...
    </FILE>

Any decoding errors are ignored so the script can process text and binary files alike
without crashing.
"""

import sys
from pathlib import Path
from typing import Final

OUTPUT_FILENAME: Final[str] = "llms_files_contents.txt"


def main() -> None:
    """Walk ``opencontractserver/llms`` and write consolidated file contents."""

    repo_root = Path(__file__).resolve().parent.parent  # project root
    base_dir = repo_root / "opencontractserver" / "llms"
    output_path = Path(__file__).resolve().parent / OUTPUT_FILENAME

    if not base_dir.exists():
        sys.stderr.write(f"Expected directory not found: {base_dir}\n")
        sys.exit(1)

    # Ensure deterministic ordering for reproducibility
    files = sorted(p for p in base_dir.rglob("*") if p.is_file())

    with output_path.open("w", encoding="utf-8") as out_fp:
        for file_path in files:
            rel_path = file_path.relative_to(repo_root)
            out_fp.write(f'<FILE path="{rel_path.as_posix()}">\n')

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception as exc:  # pragma: no cover – best-effort dump
                content = f"<<Could not read file: {exc}>>"

            out_fp.write(content)
            if not content.endswith("\n"):
                out_fp.write("\n")
            out_fp.write("</FILE>\n")

    print(f"Wrote {len(files)} files to {output_path}")


if __name__ == "__main__":
    main()
