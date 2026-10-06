"""soften_metal: lower a GLB's metal, leave everything else byte-for-byte."""
from __future__ import annotations

import json
import struct
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.glb_materials import MAX_METALLIC, soften_metal


def make_glb(doc: dict, bin_chunk: bytes = b"BINARYDATA1234") -> bytes:
    body = json.dumps(doc).encode()
    body += b" " * (-len(body) % 4)
    bin_chunk += b"\x00" * (-len(bin_chunk) % 4)
    total = 12 + 8 + len(body) + 8 + len(bin_chunk)
    return (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(body), 0x4E4F534A) + body
        + struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
    )


def read_doc(glb: bytes) -> dict:
    n = struct.unpack_from("<I", glb, 12)[0]
    return json.loads(glb[20:20 + n])


def mat(metallic=None) -> dict:
    pbr = {"baseColorFactor": [1, 1, 1, 1], "baseColorTexture": {"index": 0}}
    if metallic is not None:
        pbr["metallicFactor"] = metallic
    return {"name": "m", "pbrMetallicRoughness": pbr}


class TestSoftenMetal:
    def test_a_fully_metallic_material_is_capped(self):
        out = soften_metal(make_glb({"materials": [mat(1.0)]}))
        assert read_doc(out)["materials"][0]["pbrMetallicRoughness"]["metallicFactor"] == MAX_METALLIC

    def test_an_absent_factor_means_fully_metallic_in_gltf_so_it_is_capped_too(self):
        out = soften_metal(make_glb({"materials": [mat(None)]}))
        assert read_doc(out)["materials"][0]["pbrMetallicRoughness"]["metallicFactor"] == MAX_METALLIC

    def test_a_material_already_below_the_cap_is_left_alone(self):
        glb = make_glb({"materials": [mat(0.1)]})
        assert soften_metal(glb) == glb  # not even rewritten

    def test_everything_else_survives_and_the_file_stays_a_valid_glb(self):
        doc = {"asset": {"version": "2.0"}, "materials": [mat(1.0)], "textures": [{"source": 0}]}
        glb = make_glb(doc, bin_chunk=b"TEXTURES-AND-MESH")
        out = soften_metal(glb)

        magic, version, length = struct.unpack_from("<III", out, 0)
        assert (magic, version) == (0x46546C67, 2)
        assert length == len(out)  # the header length matches the new size
        json_len = struct.unpack_from("<I", out, 12)[0]
        assert json_len % 4 == 0  # chunks stay 4-byte aligned
        assert out[20 + json_len + 8:].startswith(b"TEXTURES-AND-MESH")  # binary chunk untouched
        new = read_doc(out)
        assert new["textures"] == doc["textures"] and new["asset"] == doc["asset"]
        assert new["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"] == {"index": 0}

    def test_every_material_is_handled(self):
        out = soften_metal(make_glb({"materials": [mat(1.0), mat(0.0), mat(0.8)]}))
        factors = [m["pbrMetallicRoughness"]["metallicFactor"] for m in read_doc(out)["materials"]]
        assert factors == [MAX_METALLIC, 0.0, MAX_METALLIC]

    @pytest.mark.parametrize("junk", [b"", b"glbbytes", b"\x00" * 40, b"glTF" + b"\x00" * 3])
    def test_anything_that_is_not_a_readable_glb_comes_back_unchanged(self, junk):
        assert soften_metal(junk) == junk

    def test_a_glb_without_materials_comes_back_unchanged(self):
        glb = make_glb({"asset": {"version": "2.0"}})
        assert soften_metal(glb) == glb


@pytest.mark.asyncio
async def test_the_photo_model_task_stores_the_softened_file():
    from app.tasks import media

    original = make_glb({"materials": [mat(1.0)]})
    fetched = MagicMock(content=original)
    fetched.raise_for_status = MagicMock()
    http = MagicMock(get=AsyncMock(return_value=fetched))
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    client = MagicMock(
        upload_image=AsyncMock(return_value="tok"),
        create_model_from_image=AsyncMock(return_value="t1"),
        wait_for_model=AsyncMock(return_value={"output": {"model_url": "https://cdn/m.glb"}, "credits_consumed": 30}),
    )
    with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"photo")), \
         patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/m.glb")) as up, \
         patch("app.core.storage.delete_file", new=AsyncMock()), \
         patch("app.services.tripo.get_tripo_client", return_value=client), \
         patch("httpx.AsyncClient", return_value=http):
        out = await media._generate_model_from_photo("u1", "src/a.jpg", "image/jpeg")

    assert out["status"] == "ok"
    stored = up.await_args.args[0]
    assert stored != original
    assert read_doc(stored)["materials"][0]["pbrMetallicRoughness"]["metallicFactor"] == MAX_METALLIC
