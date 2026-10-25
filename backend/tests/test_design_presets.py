from pathlib import Path

import pytest

from app.services.design_presets import load_presets, trim_profiles

IDS = {"neoklassika", "zamonaviy", "hitech", "milliy", "dark", "skandinav", "klassik", "loft", "minimalist"}


def test_presets_has_nine_ids():
    assert set(load_presets()) == IDS


def test_preset_fields():
    for pid, p in load_presets().items():
        assert p["id"] == pid
        for key in ("furnitureStyle", "walls", "floor", "lights", "trim", "furniture"):
            assert key in p


def test_load_presets_cached():
    assert load_presets() is load_presets()


def test_trim_profiles_sections():
    tp = trim_profiles()
    assert set(tp) == {"ceiling", "skirting", "cornice"}
    assert "tekis" in tp["skirting"] and "t140" in tp["cornice"] and "flat" in tp["ceiling"]
    for ids in tp.values():
        assert ids and all(isinstance(i, str) for i in ids)


def test_frontend_copy_identical():
    here = Path(__file__).resolve()
    root = next((d for d in here.parents if (d / "frontend").is_dir() and (d / "backend").is_dir()), None)
    if root is None:
        pytest.skip("frontend checkout not available (api container)")
    front = root / "frontend/src/lib/data/design_presets.json"
    back = root / "backend/app/data/design_presets.json"
    assert front.read_bytes() == back.read_bytes()
