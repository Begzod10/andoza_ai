"""Where a 3D model's compressed copy lives, and which file a client is sent.

The original GLB is kept as uploaded. A compressed copy (meshopt geometry, WebP
textures; see app.services.glb_optimizer) is stored beside it and, once it
exists, is the file every client gets. is_glb_with_meshes() decides whether
an uploaded file is a model at all.
"""
from __future__ import annotations

import json
import struct


def opt_key_for(key: str) -> str:
    """The compressed copy's storage key: the original's, ending in ``.opt.glb``."""
    return key[: -len(".glb")] + ".opt.glb" if key.endswith(".glb") else key + ".opt.glb"


def served_key(original: str, opt: str | None) -> str:
    """The key to hand out: the compressed copy when there is one."""
    return opt or original


def model_keys(original: str | None, opt: str | None) -> list[str]:
    """Every stored file of one model, for deleting it."""
    return [k for k in (original, opt) if k]


_GLB_JSON_CHUNK = 0x4E4F534A  # "JSON"


def is_glb_with_meshes(data: bytes) -> bool:
    """True for a binary glTF 2.0 file whose header and first (JSON) chunk
    hold together and that describes at least one mesh.

    The first four bytes alone ("glTF") are cheap to fake: a 12-byte header
    with nothing after it passed that check, was approved, and showed up in
    the shop as a model that cannot be drawn.
    """
    if len(data) < 20 or data[:4] != b"glTF":
        return False
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2 or length != len(data):
        return False
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != _GLB_JSON_CHUNK or 20 + chunk_len > len(data):
        return False
    try:
        doc = json.loads(data[20:20 + chunk_len])
    except (UnicodeDecodeError, ValueError):
        return False
    return isinstance(doc, dict) and bool(doc.get("meshes"))
