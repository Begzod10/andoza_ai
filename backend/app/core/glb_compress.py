"""Best-effort server-side compression for uploaded furniture GLBs.

Uploaded models come out of the browser exporter unoptimized (raw geometry +
full-size textures), so a single furniture piece can weigh tens of MB. We shrink
each GLB at upload time with a small Node tool (``tools/glb-compress``) that runs
gltf-transform: dedup/weld/prune + quantization + WebP texture resize + meshopt
geometry compression. Typical result is a 60-90% smaller file.

Compression is strictly best-effort: if Node is missing, the tool errors, it
times out, or the result isn't actually smaller, we return the original bytes
unchanged so an upload never fails because of it. The web studio decodes the
meshopt/quantized/WebP output (drei ``useGLTF`` enables the meshopt decoder by
default), and the mobile app renders that same web studio in a WebView.
"""

from __future__ import annotations

import asyncio
import subprocess
import tempfile
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)

# backend/app/core/glb_compress.py -> backend/tools/glb-compress
_TOOL_DIR = Path(__file__).resolve().parents[2] / "tools" / "glb-compress"
_SCRIPT = _TOOL_DIR / "compress.mjs"
_TIMEOUT_SECONDS = 180


def _run_compress(glb_bytes: bytes) -> bytes:
    """Blocking: run the Node compressor and return the smaller of the compressed
    and original bytes. Never raises — any failure yields the original."""
    if not _SCRIPT.exists():
        logger.warning("glb_compress_tool_missing", script=str(_SCRIPT))
        return glb_bytes

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.glb"
        dst = Path(tmp) / "out.glb"
        src.write_bytes(glb_bytes)
        try:
            proc = subprocess.run(
                ["node", str(_SCRIPT), str(src), str(dst)],
                capture_output=True,
                timeout=_TIMEOUT_SECONDS,
                cwd=str(_TOOL_DIR),
            )
        except subprocess.TimeoutExpired:
            logger.warning("glb_compress_timeout", seconds=_TIMEOUT_SECONDS, size=len(glb_bytes))
            return glb_bytes
        except FileNotFoundError:
            # `node` not on PATH (e.g. running outside the Docker image).
            logger.warning("glb_compress_node_missing")
            return glb_bytes

        if proc.returncode != 0 or not dst.exists():
            logger.warning(
                "glb_compress_failed",
                returncode=proc.returncode,
                stderr=proc.stderr.decode("utf-8", "replace")[-2000:],
            )
            return glb_bytes

        out = dst.read_bytes()
        if not out or len(out) >= len(glb_bytes):
            # Already optimal (or the tool grew it) — keep the original.
            logger.info("glb_compress_no_gain", before=len(glb_bytes), after=len(out))
            return glb_bytes

        logger.info(
            "glb_compressed",
            before=len(glb_bytes),
            after=len(out),
            ratio=round(len(out) / len(glb_bytes), 3),
        )
        return out


async def compress_glb(glb_bytes: bytes) -> bytes:
    """Return a size-reduced GLB, or the original if compression can't help.

    Runs the blocking Node subprocess in a worker thread so the event loop stays
    responsive, and swallows every error — compression must never break upload.
    """
    try:
        return await asyncio.to_thread(_run_compress, glb_bytes)
    except Exception as exc:  # defensive: an upload must not fail on compression
        logger.warning("glb_compress_error", error=str(exc))
        return glb_bytes
