"""Tests for smeta._furniture_lines — catalog, fallback, and per-item price
snapshots for user-uploaded models.
"""
from __future__ import annotations

from types import SimpleNamespace

from app.services.smeta import (
    FURNITURE_CATALOG_PRICES_UZS,
    FURNITURE_FALLBACK_PRICE_UZS,
    _furniture_lines,
)


def _room(furniture: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(state={"furniture": furniture})


def test_no_furniture_returns_no_lines():
    assert _furniture_lines(_room([])) == []


def test_known_catalog_item_uses_catalog_price():
    slug = next(iter(FURNITURE_CATALOG_PRICES_UZS))
    price = FURNITURE_CATALOG_PRICES_UZS[slug]
    room = _room([{"furniture_id": slug, "x": 0, "y": 0, "rotation": 0}])

    lines = _furniture_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == price
    assert lines[0].is_approximate is False
    assert lines[0].label == f"Jihoz: {slug}"


def test_unknown_item_without_snapshot_uses_fallback_and_is_approximate():
    room = _room([{"furniture_id": "some_random_nanoid", "x": 0, "y": 0, "rotation": 0}])

    lines = _furniture_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == FURNITURE_FALLBACK_PRICE_UZS
    assert lines[0].is_approximate is True
    assert lines[0].warning


def test_user_item_with_price_snapshot_overrides_fallback():
    room = _room([{
        "furniture_id": "abc123",
        "x": 0, "y": 0, "rotation": 0,
        "name": "Mening stulim",
        "unitPriceUzs": 1_500_000,
    }])

    lines = _furniture_lines(room)

    assert len(lines) == 1
    assert lines[0].unit_price_uzs == 1_500_000
    assert lines[0].is_approximate is False
    assert lines[0].label == "Jihoz: Mening stulim"


def test_multiple_placements_of_same_item_are_grouped_by_qty():
    room = _room([
        {"furniture_id": "abc123", "x": 0, "y": 0, "rotation": 0, "unitPriceUzs": 1_000_000},
        {"furniture_id": "abc123", "x": 100, "y": 100, "rotation": 90, "unitPriceUzs": 1_000_000},
    ])

    lines = _furniture_lines(room)

    assert len(lines) == 1
    assert lines[0].qty == 2
    assert lines[0].subtotal_uzs == 2_000_000


def test_ignores_placed_items_without_furniture_id():
    room = _room([{"x": 0, "y": 0, "rotation": 0}])
    assert _furniture_lines(room) == []
