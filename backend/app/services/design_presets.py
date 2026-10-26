"""Design presets shared with the frontend.

The canonical file is ``app/data/design_presets.json``; ``frontend/src/lib/data/design_presets.json``
is a byte-identical copy (each Docker build context only sees its own folder). A test keeps them equal.
"""
import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "data" / "design_presets.json"


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_presets() -> dict[str, dict]:
    """Presets keyed by id."""
    return {p["id"]: p for p in _data()["presets"]}


def trim_profiles() -> dict[str, list[str]]:
    """Valid ids per trim section: ceiling designs, skirting and cornice profiles."""
    return _data()["trimProfiles"]
