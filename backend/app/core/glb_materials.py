"""Small edits to a finished GLB's materials, without touching its geometry or textures."""
from __future__ import annotations

import json
import struct

_GLB_MAGIC = 0x46546C67  # "glTF"
_JSON_CHUNK = 0x4E4F534A  # "JSON"

# Chrome legs on a photographed chair come back from Tripo as fully metallic. A
# metal surface shows only what it reflects, so in a room with dim environment
# light it renders near-black. A third of the way to metal keeps a silvery sheen
# without the black.
MAX_METALLIC = 0.3


def soften_metal(glb: bytes, max_metallic: float = MAX_METALLIC) -> bytes:
    """Cap every material's ``metallicFactor`` at ``max_metallic``.

    The factor multiplies the metallic texture, so capping it lowers metal
    everywhere at once. Returns the input unchanged if it is not a GLB we can
    read or if nothing needs lowering — an odd file must never fail a build that
    has already been paid for.
    """
    try:
        magic, version, _length = struct.unpack_from("<III", glb, 0)
        if magic != _GLB_MAGIC or version != 2:
            return glb
        json_len, json_type = struct.unpack_from("<II", glb, 12)
        if json_type != _JSON_CHUNK:
            return glb
        doc = json.loads(glb[20:20 + json_len])

        changed = False
        for material in doc.get("materials", []):
            pbr = material.setdefault("pbrMetallicRoughness", {})
            # glTF's default is 1.0 when the factor is absent.
            if float(pbr.get("metallicFactor", 1.0)) > max_metallic:
                pbr["metallicFactor"] = max_metallic
                changed = True
        if not changed:
            return glb

        new_json = json.dumps(doc, separators=(",", ":")).encode()
        new_json += b" " * (-len(new_json) % 4)  # chunks are 4-byte aligned, padded with spaces
        rest = glb[20 + json_len:]
        total = 12 + 8 + len(new_json) + len(rest)
        return (
            struct.pack("<III", _GLB_MAGIC, 2, total)
            + struct.pack("<II", len(new_json), _JSON_CHUNK)
            + new_json
            + rest
        )
    except Exception:
        return glb
