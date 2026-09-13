"""Never-raise wrapper around the Blender USDZ→GLB script.

Follows the project's external-tool convention: temp files, a bounded
`subprocess.run` timeout, and best-effort semantics (returns False instead of
raising) — the studio renders the room from parametric data whether or not a GLB
is produced.
"""
from __future__ import annotations

import logging
import os
import subprocess

logger = logging.getLogger(__name__)

# Overridable so the converter image can point at its own Blender install.
BLENDER_BIN = os.environ.get("BLENDER_BIN", "blender")
_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "tools", "usdz_to_glb.py")
_TIMEOUT_S = int(os.environ.get("USDZ_TO_GLB_TIMEOUT", "180"))


def usdz_to_glb(in_path: str, out_path: str) -> bool:
    """Convert *in_path* (.usdz) → *out_path* (.glb) via headless Blender.

    Returns True on success (and a non-empty output file), False otherwise —
    never raises.
    """
    try:
        proc = subprocess.run(
            [BLENDER_BIN, "-b", "--python", _SCRIPT, "--", in_path, out_path],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
        )
    except FileNotFoundError:
        logger.warning("usdz_to_glb: Blender not found at %r", BLENDER_BIN)
        return False
    except subprocess.TimeoutExpired:
        logger.warning("usdz_to_glb: timed out after %ss", _TIMEOUT_S)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("usdz_to_glb: unexpected error: %s", exc)
        return False

    ok = proc.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 0
    if not ok:
        logger.warning(
            "usdz_to_glb: failed rc=%s stderr=%s", proc.returncode, (proc.stderr or "")[-500:]
        )
    return ok
