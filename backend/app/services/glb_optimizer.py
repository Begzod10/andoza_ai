"""Compress a GLB for the studio: meshopt geometry, WebP textures no larger than 2048 px.

Settings are the ones checked by eye on the heaviest production models
(docs/superpowers/specs/2026-10-10-glb-optimization-design.md): the result looked
the same as the original and drew its first frame 2-6x sooner. Simplifying the
mesh is deliberately left off: it spoiled knitted fabric.

Runs the `gltf-transform` CLI (installed in the server image). Blocking: call it
from a worker thread or a Celery task, never on the event loop.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

OPTIMIZE_ARGS = (
    "--compress", "meshopt",
    "--texture-compress", "webp",
    "--texture-size", "2048",
    "--simplify", "false",
)


def optimize_glb_bytes(data: bytes, *, timeout: float = 300.0, cli: str = "gltf-transform") -> bytes | None:
    """The compressed GLB, or None when compressing failed or did not make it smaller."""
    with tempfile.TemporaryDirectory(prefix="glb-opt-") as tmp:
        src, dst = Path(tmp) / "in.glb", Path(tmp) / "out.glb"
        src.write_bytes(data)
        try:
            done = subprocess.run(
                [cli, "optimize", str(src), str(dst), *OPTIMIZE_ARGS],
                timeout=timeout, capture_output=True,
            )
        except FileNotFoundError:
            log.warning("glb_optimize_skipped", reason="cli_missing", cli=cli)
            return None
        except subprocess.TimeoutExpired:
            log.warning("glb_optimize_skipped", reason="timeout", seconds=timeout)
            return None
        if done.returncode != 0:
            log.warning("glb_optimize_skipped", reason="failed", code=done.returncode,
                        stderr=(done.stderr or b"")[-500:].decode("utf-8", "replace"))
            return None
        out = dst.read_bytes() if dst.exists() else b""
        if not out or len(out) >= len(data):
            log.info("glb_optimize_skipped", reason="not_smaller", before=len(data), after=len(out))
            return None
        return out
