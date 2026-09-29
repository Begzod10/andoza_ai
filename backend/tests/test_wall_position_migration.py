"""The 1786000004 discriminator, which decides what gets moved.

The migration re-bases openings the *studio* placed (a left-edge fraction) onto
the centre convention, and must leave openings the *scan converter* placed
(already a centre) alone. It tells them apart from the ``rooms.state`` blob's
twin element, so the rule is worth pinning down on its own: get it wrong in one
direction and scanned rooms move half a door width for no reason, in the other
and hand-drawn rooms never get fixed.
"""
import importlib.util
import json
from pathlib import Path

import pytest

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "1786000004_wall_element_position_to_centre.py"
)


def _module():
    # Alembic version files are not importable as a package.
    spec = importlib.util.spec_from_file_location("_m1786000004", _MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize(
    "twin, is_scan, expected",
    [
        # A drag or keyboard nudge sets the flag explicitly — always a placement.
        ({"position": 1200, "positionAuto": False}, False, True),
        ({"position": 1200, "positionAuto": False}, True, True),
        # Still a placeholder: renders auto-spread, saved as a centred 0.5.
        ({"position": 0, "positionAuto": True}, False, False),
        ({"position": 0, "positionAuto": True}, True, False),
        # Pre-flag (before 2026-09-13): a positive position on a hand-drawn room
        # can only have come from a drag…
        ({"position": 1200}, False, True),
        # …but on a scanned room it is just the converter's own value echoed
        # back through the store, and moving it would be the bug, not the fix.
        ({"position": 1200}, True, False),
        ({"position": 0}, False, False),
        # No twin at all (room saved before the state blob carried geometry).
        (None, False, False),
    ],
)
def test_studio_placed_rule(twin, is_scan, expected):
    assert _module()._studio_placed(twin, is_scan) is expected


class _FakeConnection:
    """Just enough of a SQLAlchemy connection for `_shift`: one SELECT of the
    given rows, then whatever UPDATEs the migration decides to issue."""

    def __init__(self, rows):
        self._rows = rows
        self.updates = {}

    def execute(self, statement, params=None):
        if params is None:
            return self
        self.updates[params["id"]] = json.loads(params["geometry"])
        return None

    def mappings(self):
        return self

    def all(self):
        return self._rows


def _room(*, is_scan, elements, twins, length=4.0):
    return {
        "id": "room-1",
        "geometry": {"walls": [{"id": "0", "length": length, "elements": elements}]},
        "state": {"geometry": {"walls": [{"id": "0", "elements": twins}]}},
        "is_scan": is_scan,
    }


def test_shift_moves_a_studio_placed_opening_onto_its_centre():
    """A 900 mm door on a 4 m wall: left-edge 0.1875 → centre 0.30, the same
    0.30 `convert_captured_room` writes for the shared scan fixture's door."""
    mod = _module()
    row = _room(
        is_scan=False,
        elements=[{"type": "eshik", "width": 0.9, "position": 0.1875}],
        twins=[{"position": 750, "positionAuto": False}],
    )
    connection = _FakeConnection([row])

    mod._shift(connection, +1)
    moved = connection.updates["room-1"]["walls"][0]["elements"][0]["position"]
    assert moved == pytest.approx(0.30)

    # …and back, exactly: the downgrade is the same rule with the sign flipped.
    connection = _FakeConnection([_room(
        is_scan=False,
        elements=[{"type": "eshik", "width": 0.9, "position": moved}],
        twins=[{"position": 750, "positionAuto": False}],
    )])
    mod._shift(connection, -1)
    back = connection.updates["room-1"]["walls"][0]["elements"][0]["position"]
    assert back == pytest.approx(0.1875)


def test_shift_leaves_a_scan_written_centre_alone():
    """The failure mode that would be worse than the bug: every scanned room's
    openings walking half a width down the wall on deploy."""
    mod = _module()
    connection = _FakeConnection([_room(
        is_scan=True,
        elements=[{"type": "eshik", "width": 0.9, "position": 0.30}],
        # Loaded from the API and re-saved untouched — no flag, positive mm.
        twins=[{"position": 1200}],
    )])
    mod._shift(connection, +1)
    assert connection.updates == {}
