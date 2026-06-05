"""Run hg-fast-export.py with line-buffered stderr for live log streaming."""

from __future__ import annotations

import os
import runpy
import sys


def _line_buffer_stderr() -> None:
    if hasattr(sys.stderr, "reconfigure"):
        try:
            sys.stderr.reconfigure(line_buffering=True, write_through=True)
        except (ValueError, OSError):
            pass
    buf = getattr(sys.stderr, "buffer", None)
    if buf is not None and hasattr(buf, "reconfigure"):
        try:
            buf.reconfigure(line_buffering=True, write_through=True)
        except (ValueError, OSError):
            pass


def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: hgFastExportLauncher.py <hg-fast-export.py> [args...]\n")
        raise SystemExit(2)
    _line_buffer_stderr()
    script = os.path.abspath(sys.argv[1])
    script_dir = os.path.dirname(script)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    os.chdir(script_dir)
    sys.argv = [script, *sys.argv[2:]]
    runpy.run_path(script, run_name="__main__")


if __name__ == "__main__":
    main()
