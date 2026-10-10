"""The one-off backfill: which models it picks, and that a dry run writes nothing."""
import asyncio
import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "optimize_models", Path(__file__).resolve().parents[1] / "scripts" / "optimize_models.py"
)
script = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(script)

FURNITURE = [("f1", "furniture/a.glb", None), ("f2", "furniture/b.glb", "furniture/b.opt.glb"),
             ("f3", "https://cdn.example.com/c.glb", None), ("f4", None, None)]
USERS = [("u1", "models/u/a.glb", None)]


def test_only_models_without_a_copy_and_stored_here_are_picked():
    assert script.pick_candidates(FURNITURE, USERS, None) == [
        ("furniture", "f1", "furniture/a.glb"), ("user_model", "u1", "models/u/a.glb"),
    ]


def test_only_narrows_to_one_kind():
    assert script.pick_candidates(FURNITURE, USERS, "furniture") == [("furniture", "f1", "furniture/a.glb")]
    assert script.pick_candidates(FURNITURE, USERS, "user_models") == [("user_model", "u1", "models/u/a.glb")]


@pytest.fixture
def stubbed(monkeypatch):
    calls = {"optimized": [], "uploads": 0}

    async def rows():
        return FURNITURE, USERS

    async def download(key):
        return b"x" * 2048

    async def optimize(kind, model_id):
        calls["optimized"].append((kind, model_id))
        return {"status": "ok", "before": 2048, "after": 1024}

    async def upload(*a, **kw):
        calls["uploads"] += 1

    monkeypatch.setattr(script, "load_rows", rows)
    monkeypatch.setattr("app.core.storage.download_file", download)
    monkeypatch.setattr("app.core.storage.upload_file", upload)
    monkeypatch.setattr("app.tasks.media._optimize_model", optimize)
    return calls


def test_a_dry_run_compresses_and_writes_nothing(stubbed, capsys):
    asyncio.run(script.main(["--dry-run"]))
    assert stubbed == {"optimized": [], "uploads": 0}
    out = capsys.readouterr().out
    assert "2 ta model" in out and "furniture/a.glb" in out


def test_a_real_run_goes_one_by_one_and_respects_the_limit(stubbed, capsys):
    asyncio.run(script.main(["--limit", "1"]))
    assert stubbed["optimized"] == [("furniture", "f1")]
    assert "2 KB -> 1 KB" in capsys.readouterr().out
