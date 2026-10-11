"""Where a 3D model's compressed copy lives, and which file a client is sent.

The original GLB is kept as uploaded. A compressed copy (meshopt geometry, WebP
textures; see app.services.glb_optimizer) is stored beside it and, once it
exists, is the file every client gets.
"""
from __future__ import annotations


def opt_key_for(key: str) -> str:
    """The compressed copy's storage key: the original's, ending in ``.opt.glb``."""
    return key[: -len(".glb")] + ".opt.glb" if key.endswith(".glb") else key + ".opt.glb"


def served_key(original: str, opt: str | None) -> str:
    """The key to hand out: the compressed copy when there is one."""
    return opt or original


def model_keys(original: str | None, opt: str | None) -> list[str]:
    """Every stored file of one model, for deleting it."""
    return [k for k in (original, opt) if k]
