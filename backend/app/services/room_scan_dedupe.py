"""A second LiDAR scan of the same room replaces the first, untouched one.

The phone app creates a new room for every scan, so scanning a room again (a
retry, a better pass) left both copies standing in the flat and drawn side by
side in the studio. When a scan is uploaded, an earlier scan in the same flat
is retired if it is plainly the same room and nobody has worked on it:

  * a LiDAR scan taken within the last 30 minutes,
  * floor area within 15% and ceiling height within 10 cm,
  * no design of any kind: no finishes, furniture, lights or materials.

Retired the way a user's delete retires a room (``deleted = True``), so it is
reversible and the stored files stay where they are.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)

WINDOW = timedelta(minutes=30)
AREA_TOLERANCE = 0.15
CEILING_TOLERANCE_M = 0.10
# What a room's state holds before anyone designs anything in it: the layout
# position the studio stores on first open, and copies of what the scan set.
_BLANK_STATE_KEYS = {"layoutPos", "name", "ceilingHeight", "geometry", "furniture", "lights", "electricals"}


def _scanned_at(room: Any) -> datetime | None:
    scan = room.room_scan if isinstance(room.room_scan, dict) else None
    if not scan or scan.get("source") != "lidar":
        return None
    try:
        at = datetime.fromisoformat(str(scan.get("scanned_at")))
    except ValueError:
        return None
    return at if at.tzinfo else at.replace(tzinfo=timezone.utc)


def is_untouched(room: Any) -> bool:
    """Nobody has designed anything in this room yet."""
    if room.surfaces or room.furniture_layout:
        return False
    state = room.state if isinstance(room.state, dict) else {}
    if set(state) - _BLANK_STATE_KEYS:
        return False
    return not any(state.get(k) for k in ("furniture", "lights", "electricals"))


def is_same_scan(new: Any, old: Any, now: datetime) -> bool:
    """*old* is an earlier, recent LiDAR scan of the room *new* scanned again."""
    at = _scanned_at(old)
    if at is None or now - at > WINDOW:
        return False
    if not (new.floor_area and old.floor_area and new.ceiling_h and old.ceiling_h):
        return False
    if abs(float(old.floor_area) - float(new.floor_area)) > AREA_TOLERANCE * float(new.floor_area):
        return False
    return abs(float(old.ceiling_h) - float(new.ceiling_h)) <= CEILING_TOLERANCE_M


async def retire_earlier_scans(db: AsyncSession, room: Any, *, now: datetime | None = None) -> list[uuid.UUID]:
    """Soft-delete the untouched earlier scans of *room* in its flat; their ids."""
    from app.models.room import Room

    now = now or datetime.now(timezone.utc)
    candidates = (
        await db.execute(
            select(Room).where(
                Room.apartment_id == room.apartment_id,
                Room.id != room.id,
                Room.deleted == False,  # noqa: E712 — SQL comparison
                Room.room_scan.is_not(None),
            )
        )
    ).scalars().all()
    retired = []
    for old in candidates:
        if is_same_scan(room, old, now) and is_untouched(old):
            old.deleted = True
            retired.append(old.id)
    if retired:
        log.info("room_scan_duplicates_retired", room_id=str(room.id), retired=[str(i) for i in retired])
    return retired
