"""The model_yaw backfill: the Node detector agrees with the studio's, and the script turns only
the rows it should (once)."""
import asyncio
import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
DETECTOR = SCRIPTS / "model_yaw_detect.mjs"
GLTF_CLI = Path("/usr/local/lib/node_modules/@gltf-transform/cli/package.json")

_SPEC = importlib.util.spec_from_file_location("model_yaw_backfill", SCRIPTS / "model_yaw_backfill.py")
script = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(script)


# ---- the detector --------------------------------------------------------- #

def test_detector_matches_frontend_cases():
    root = next((d for d in DETECTOR.parents if (d / "frontend").is_dir() and (d / "backend").is_dir()), None)
    if root is None:
        pytest.skip("frontend checkout not available (api container)")
    cases_path = root / "frontend/src/lib/__tests__/fixtures/modelYawCases.json"
    if not cases_path.is_file():
        pytest.skip("modelYawCases.json missing")
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not installed")

    out = subprocess.run([node, str(DETECTOR), "--points", str(cases_path)],
                         capture_output=True, text=True, timeout=60, check=True).stdout
    cases = json.loads(cases_path.read_text())
    assert json.loads(out) == [{"name": c["name"], "yaw": c["yaw"], "detected": c["detected"]} for c in cases]


# A bed whose back is at -Z in the mesh, on a node turned +90° about Y under a moved parent: in the
# model's frame the back is at -X, so the yaw is 270 and the size is the turned one.
_MAKE_GLB = r"""
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('/usr/local/lib/node_modules/@gltf-transform/cli/package.json')
const { Document, NodeIO } = require('@gltf-transform/core')
const pts = []
for (let x = -1; x <= 1; x += 0.5) for (let z = -0.8; z <= 0.8; z += 0.4) for (const y of [0, 0.2, 0.4]) pts.push(x, y, z)
for (let x = -1; x <= 1; x += 0.5) for (const z of [-0.9, -0.8]) for (const y of [0, 0.333, 0.667, 1]) pts.push(x, y, z)
const doc = new Document()
const buf = doc.createBuffer()
const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pts)).setBuffer(buf)
const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setMode(0))
const child = doc.createNode('bed').setMesh(mesh).setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2])
const parent = doc.createNode('root').setTranslation([5, 1, -3]).addChild(child)
doc.createScene().addChild(parent)
fs.writeFileSync(process.argv[1], await new NodeIO().writeBinary(doc))
"""


def test_detector_reads_a_glb_in_its_own_frame(tmp_path):
    node = shutil.which("node")
    if node is None or not GLTF_CLI.is_file():
        pytest.skip("node with a global gltf-transform needed (api/converter image)")
    glb = tmp_path / "bed.glb"
    subprocess.run([node, "--input-type=module", "-e", _MAKE_GLB, str(glb)], check=True, timeout=60)

    out = subprocess.run([node, str(DETECTOR), str(glb)], capture_output=True, text=True, timeout=60, check=True)
    got = json.loads(out.stdout)
    assert (got["file"], got["yaw"], got["detected"]) == (str(glb), 270, True)
    assert got["size"] == pytest.approx([1.7, 1.0, 2.0], abs=1e-4)


def test_detector_reports_a_broken_file(tmp_path):
    node = shutil.which("node")
    if node is None or not GLTF_CLI.is_file():
        pytest.skip("node with a global gltf-transform needed (api/converter image)")
    bad = tmp_path / "bad.glb"
    bad.write_bytes(b"not a glb")
    out = subprocess.run([node, str(DETECTOR), str(bad)], capture_output=True, text=True, timeout=60)
    assert out.returncode != 0
    assert "error" in json.loads(out.stdout.strip().splitlines()[-1])


# ---- the backfill --------------------------------------------------------- #

def _row(name="Karavot 1", category="karavot", yaw=0, w=232, d=197, key="furniture/k1.glb"):
    return SimpleNamespace(id=f"id-{name}", name_uz=name, category=category, glb_key=key,
                           model_yaw=yaw, footprint_w=w, footprint_d=d)


@pytest.fixture
def stubbed(monkeypatch):
    """The DB is a list of rows; save() writes into it as an UPDATE would."""
    db = {"rows": [], "detected": [], "saved": []}

    async def rows():
        return db["rows"]

    def detect(path):
        db["detected"].append(path)
        return {"yaw": 270, "detected": True, "size": [2.32, 1.22, 1.97]}

    async def placements(furniture_id):
        return 3

    async def save(furniture_id, yaw, w, d):
        db["saved"].append(furniture_id)
        row = next(r for r in db["rows"] if r.id == furniture_id)
        row.model_yaw, row.footprint_w, row.footprint_d = yaw, w, d

    monkeypatch.setattr(script, "load_rows", rows)
    monkeypatch.setattr(script, "detect", detect)
    monkeypatch.setattr(script, "count_placements", placements)
    monkeypatch.setattr(script, "save", save)
    return db


def test_backfill_dry_run_changes_nothing(stubbed, capsys):
    row = _row()
    stubbed["rows"] = [row]
    asyncio.run(script.main(["--dry-run"]))
    assert (row.model_yaw, row.footprint_w, row.footprint_d) == (0, 232, 197)
    assert stubbed["saved"] == []
    out = capsys.readouterr().out
    assert "Karavot 1" in out and "0→270" in out and "232×197→197×232" in out and "placements=3" in out


def test_backfill_turns_and_swaps(stubbed, capsys):
    row = _row()
    stubbed["rows"] = [row]
    asyncio.run(script.main([]))
    assert (row.model_yaw, row.footprint_w, row.footprint_d) == (270, 197, 232)
    assert stubbed["detected"] == [Path(script.settings.MEDIA_ROOT) / "furniture/k1.glb"]


def test_backfill_skips_rows_already_turned(stubbed):
    row = _row()
    stubbed["rows"] = [row, _row("Karavot 2", yaw=270, w=197, d=232)]
    asyncio.run(script.main([]))
    asyncio.run(script.main([]))
    assert (row.model_yaw, row.footprint_w, row.footprint_d) == (270, 197, 232)
    assert stubbed["saved"] == ["id-Karavot 1"]
    assert stubbed["rows"][1].footprint_w == 197


def test_backfill_skips_roles_without_a_back(stubbed):
    stubbed["rows"] = [_row("Ovqat stoli", category="stol"), _row("Gilam", category="dekor")]
    asyncio.run(script.main([]))
    assert stubbed["detected"] == [] and stubbed["saved"] == []


def test_backfill_skips_remote_and_missing_models(stubbed):
    stubbed["rows"] = [_row(key="https://cdn.example.com/k.glb"), _row("Karavot 3", key=None)]
    asyncio.run(script.main([]))
    assert stubbed["detected"] == []


def test_backfill_only_and_limit(stubbed):
    stubbed["rows"] = [_row("A"), _row("B"), _row("C")]
    asyncio.run(script.main(["--only", "id-B"]))
    assert stubbed["saved"] == ["id-B"]
    asyncio.run(script.main(["--limit", "1"]))
    assert stubbed["saved"] == ["id-B", "id-A"]


def test_backfill_leaves_an_undetected_model_and_reports_errors(stubbed, monkeypatch, capsys):
    stubbed["rows"] = [_row("Puf", category="divan"), _row("Singan", category="divan")]

    def detect(path):
        if "Singan" in str(path):
            raise script.DetectError("bad glb")
        return {"yaw": 0, "detected": False, "size": [1, 1, 1]}

    stubbed["rows"][1].glb_key = "furniture/Singan.glb"
    monkeypatch.setattr(script, "detect", detect)
    asyncio.run(script.main([]))
    assert stubbed["saved"] == []
    out = capsys.readouterr().out
    assert "Puf" in out and "aniqlanmadi" in out
    assert "Singan" in out and "bad glb" in out


def test_detect_runs_node_with_a_timeout(monkeypatch, tmp_path):
    seen = {}

    def run(cmd, **kw):
        seen.update(cmd=cmd, **kw)
        return SimpleNamespace(returncode=0, stdout='{"file": "x", "yaw": 90, "detected": true, "size": [1, 1, 1]}\n',
                               stderr="")

    monkeypatch.setattr(script.subprocess, "run", run)
    assert script.detect(tmp_path / "x.glb")["yaw"] == 90
    assert seen["cmd"][1:] == [str(script.DETECTOR), str(tmp_path / "x.glb")] and seen["timeout"] == 60


def test_detect_turns_failures_into_detect_errors(monkeypatch, tmp_path):
    def failing(cmd, **kw):
        return SimpleNamespace(returncode=1, stdout='{"file": "x", "error": "Invalid glTF"}\n', stderr="")

    monkeypatch.setattr(script.subprocess, "run", failing)
    with pytest.raises(script.DetectError, match="Invalid glTF"):
        script.detect(tmp_path / "x.glb")

    def slow(cmd, **kw):
        raise subprocess.TimeoutExpired(cmd, 60)

    monkeypatch.setattr(script.subprocess, "run", slow)
    with pytest.raises(script.DetectError, match="timed out"):
        script.detect(tmp_path / "x.glb")
