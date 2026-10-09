"""Pipe-riser boxes found in a LiDAR scan come off the floor that gets laminate / tile."""
from __future__ import annotations

from types import SimpleNamespace

from app.services.smeta import (
    LAMINAT_WASTE_DEFAULT, PACK_M2, _floor_covering_area_m2, _laminate_lines, _riser_footprint_m2,
)


def _feat(**over):
    return {"kind": "riser", "confidence": "high", "source": "storage",
            "x": 1, "y": 1, "width": 0.4, "depth": 0.33, "height": 2.28, "rotation_rad": 0, **over}


def _room(features=None, floor_area=12.0):
    scan = None if features is None else {"features": features}
    return SimpleNamespace(floor_area=floor_area, perimeter=14.0, openings_count=0,
                           geometry={"walls": []}, room_scan=scan)


def test_a_confident_riser_comes_off_the_floor():
    room = _room([_feat()])
    assert _riser_footprint_m2(room) == 0.4 * 0.33
    assert _floor_covering_area_m2(room) == 12.0 - 0.4 * 0.33


def test_only_confident_undismissed_risers_count():
    room = _room([_feat(confidence="medium"), _feat(confidence="low"),
                  _feat(kind="wall_box"), _feat(dismissed=True), _feat(width=0)])
    assert _riser_footprint_m2(room) == 0
    assert _floor_covering_area_m2(room) == 12.0


def test_a_piece_of_wall_without_depth_counts_as_square():
    assert _riser_footprint_m2(_room([_feat(depth=None, width=0.3)])) == 0.3 * 0.3


def test_rooms_without_a_scan_or_features_are_unchanged():
    for scan_features in (None, []):
        assert _floor_covering_area_m2(_room(scan_features)) == 12.0
    assert _floor_covering_area_m2(SimpleNamespace(floor_area=9.0)) == 9.0


def test_laminate_is_measured_on_the_floor_less_the_riser():
    mat = SimpleNamespace(id="l1", name_uz="Laminat", unit="m2", price_uzs=100_000, store=None)
    norm = SimpleNamespace(coverage_per_unit=PACK_M2, waste_factor=LAMINAT_WASTE_DEFAULT)
    plain = _laminate_lines(_room(), mat, norm, {})[0]
    boxed = _laminate_lines(_room([_feat(width=1.0, depth=1.0)]), mat, norm, {})[0]
    assert boxed.formula.startswith("11.00 m²")
    assert boxed.subtotal_uzs <= plain.subtotal_uzs
