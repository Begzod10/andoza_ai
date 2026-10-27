"""A second LiDAR scan of the same room replaces the first, untouched one.

The phone creates a new room for every scan, so scanning a room again left
two copies of it in the flat (612c / d790: 5.55 x 3.0 m and 5.5 x 3.0 m,
2.37 and 2.38 m ceilings, five minutes apart). The earlier copy is retired the
way a user's delete retires a room (soft delete), but only when it is plainly
the same room and nobody has worked on it.
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.room_scan_dedupe import is_same_scan, is_untouched, retire_earlier_scans

NOW = datetime(2026, 10, 9, 18, 25, tzinfo=timezone.utc)


def _room(*, area=16.6, ceiling=2.37, minutes_ago=5, source="lidar", state=None, surfaces=None,
          furniture_layout=None, apartment_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(), apartment_id=apartment_id or uuid.UUID(int=1), deleted=False,
        floor_area=area, ceiling_h=ceiling,
        room_scan={"source": source, "scanned_at": (NOW - timedelta(minutes=minutes_ago)).isoformat()},
        state=state if state is not None else {}, surfaces=surfaces, furniture_layout=furniture_layout,
    )


NEW = _room(area=16.5, ceiling=2.38, minutes_ago=0)


class TestUntouched:
    def test_a_room_nobody_opened_is_untouched(self):
        assert is_untouched(_room())
        assert is_untouched(_room(state={"layoutPos": {"x": 1, "z": 2}, "name": "Mening xonam"}))

    def test_anything_designed_counts_as_touched(self):
        assert not is_untouched(_room(state={"designState": {"floorType": "parquet"}}))
        assert not is_untouched(_room(state={"furniture": [{"id": "x"}]}))
        assert not is_untouched(_room(state={"lights": [{"id": "l"}]}))
        assert not is_untouched(_room(surfaces={"floor": "m1"}))
        assert not is_untouched(_room(furniture_layout=[{"id": "x"}]))

    def test_empty_lists_are_still_untouched(self):
        assert is_untouched(_room(state={"furniture": [], "lights": [], "electricals": []}))


class TestSameScan:
    def test_the_real_pair_matches(self):
        assert is_same_scan(NEW, _room(), NOW)

    def test_a_different_size_or_height_is_another_room(self):
        assert not is_same_scan(NEW, _room(area=21.9), NOW)  # +33%
        assert not is_same_scan(NEW, _room(ceiling=2.60), NOW)

    def test_an_old_scan_is_kept(self):
        assert not is_same_scan(NEW, _room(minutes_ago=45), NOW)

    def test_a_drawn_room_is_never_a_scan_copy(self):
        drawn = _room()
        drawn.room_scan = None
        assert not is_same_scan(NEW, drawn, NOW)
        assert not is_same_scan(NEW, _room(source="manual"), NOW)


def _db(candidates):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = candidates
    db.execute = AsyncMock(return_value=result)
    return db


class TestRetire:
    def test_the_untouched_copy_is_soft_deleted_and_reported(self):
        old = _room()
        retired = asyncio.run(retire_earlier_scans(_db([old]), NEW, now=NOW))
        assert retired == [old.id]
        assert old.deleted is True

    def test_a_copy_someone_designed_is_kept(self):
        old = _room(state={"designState": {"floorType": "parquet"}})
        assert asyncio.run(retire_earlier_scans(_db([old]), NEW, now=NOW)) == []
        assert old.deleted is False

    def test_another_room_in_the_flat_is_kept(self):
        other = _room(area=37.7, ceiling=3.17)
        assert asyncio.run(retire_earlier_scans(_db([other]), NEW, now=NOW)) == []
        assert other.deleted is False


def _grouped(group, **kw):
    room = _room(**kw)
    if group is not None:
        room.room_scan["scan_group"] = group
    return room


class TestScanGroup:
    """Rooms of one multi-room scan session are different rooms, however alike."""

    def test_same_group_rooms_are_not_retired(self):
        assert not is_same_scan(_grouped("g1", area=12.0, ceiling=2.7, minutes_ago=0),
                                _grouped("g1", area=12.0, ceiling=2.7), NOW)

    def test_other_group_still_retired(self):
        assert is_same_scan(_grouped("g2", area=12.0, ceiling=2.7, minutes_ago=0),
                            _grouped("g1", area=12.0, ceiling=2.7), NOW)

    def test_no_group_still_retired(self):
        assert is_same_scan(_grouped(None, area=12.0, ceiling=2.7, minutes_ago=0),
                            _grouped(None, area=12.0, ceiling=2.7), NOW)
