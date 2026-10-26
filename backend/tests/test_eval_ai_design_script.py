"""The AI design eval harness: its summary recorder passes on everything reconcile_summary takes."""
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

_SPEC = importlib.util.spec_from_file_location(
    "eval_ai_design", Path(__file__).resolve().parents[1] / "scripts" / "eval_ai_design.py"
)
script = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(script)


def test_the_recorder_forwards_catalog_names_and_piece_styles(monkeypatch):
    reconcile = MagicMock(return_value=["a dropped piece"])
    monkeypatch.setattr(script, "_reconcile", reconcile)
    plan = MagicMock(summary="Model summary.")
    rec: dict = {}
    token = script._capture.set(rec)
    try:
        problems = script._recording_reconcile(plan, ["Divan"], {"Divan": ["loft"]})
    finally:
        script._capture.reset(token)
    reconcile.assert_called_once_with(plan, ["Divan"], {"Divan": ["loft"]})
    assert problems == ["a dropped piece"]
    assert rec == {"raw_summary": "Model summary.", "summary_kept": False, "summary_problems": ["a dropped piece"]}
