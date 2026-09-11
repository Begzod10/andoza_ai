"""Tests for smeta._light_lines — catalog pricing, fallback, and the
missing-`type` default (lights saved before fixture types existed).
"""
from __future__ import annotations

from types import SimpleNamespace

from app.services.smeta import (
    DEFAULT_LIGHT_TYPE,
    LIGHT_CATALOG_PRICES_UZS,
    LIGHT_FALLBACK_PRICE_UZS,
    LIGHT_TYPE_NAMES,
    _light_lines,
)


def _room(lights: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(state={"lights": lights})


def test_no_lights_returns_no_lines():
    assert _light_lines(_room([])) == []


def test_known_fixture_type_uses_catalog_price():
    light_type = next(iter(LIGHT_CATALOG_PRICES_UZS))
    price = LIGHT_CATALOG_PRICES_UZS[light_type]
    room = _room([{"type": light_type, "xMm": 0, "zMm": 0}])

    lines = _light_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == price
    assert lines[0].is_approximate is False
    assert lines[0].label == f"Chiroq: {LIGHT_TYPE_NAMES[light_type]}"
    assert lines[0].category == "chiroq"


def test_unknown_fixture_type_uses_fallback_and_is_approximate():
    room = _room([{"type": "some_future_fixture", "xMm": 0, "zMm": 0}])

    lines = _light_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == LIGHT_FALLBACK_PRICE_UZS
    assert lines[0].is_approximate is True
    assert lines[0].warning


def test_missing_type_falls_back_to_default_light_type():
    """Lights saved before fixture types existed carry no `type` at all —
    those are plain ceiling lights, not an "unknown fixture" approximation."""
    room = _room([{"xMm": 0, "zMm": 0}])

    lines = _light_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == LIGHT_CATALOG_PRICES_UZS[DEFAULT_LIGHT_TYPE]
    assert lines[0].is_approximate is False


def test_multiple_placements_of_same_type_are_grouped_by_qty():
    room = _room([
        {"type": "pendant", "xMm": 0, "zMm": 0},
        {"type": "pendant", "xMm": 500, "zMm": 500},
    ])

    lines = _light_lines(room)

    assert len(lines) == 1
    assert lines[0].qty == 2
    assert lines[0].subtotal_uzs == 2 * LIGHT_CATALOG_PRICES_UZS["pendant"]


def test_different_types_produce_separate_lines():
    room = _room([
        {"type": "chandelier", "xMm": 0, "zMm": 0},
        {"type": "downlight", "xMm": 500, "zMm": 500},
    ])

    lines = _light_lines(room)

    assert len(lines) == 2
    labels = {ln.label for ln in lines}
    assert labels == {"Chiroq: Qandil", "Chiroq: Downlight"}


def test_ignores_non_dict_entries():
    room = _room(["not-a-dict"])  # type: ignore[list-item]
    assert _light_lines(room) == []
