"""
get_or_create_room_row: the one-row-per-room tables (room_states,
room_decorations, room_electrical) are created on first read.

Opening a room fires several reads at once. Each used to SELECT, find
nothing, INSERT, and every request but the first then died on the unique
key with a 500. The insert now runs in a savepoint; losing that race rolls
back only the savepoint and returns the row the winner created.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.decoration import RoomDecoration
from app.services.room_rows import get_or_create_room_row


class _Result:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row

    def scalar_one(self):
        assert self._row is not None
        return self._row


def _db(*selects, flush_error=None):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[_Result(r) for r in selects])
    db.flush = AsyncMock(side_effect=flush_error)
    savepoints = []

    @asynccontextmanager
    async def begin_nested():
        savepoints.append("open")
        try:
            yield
        except Exception:
            savepoints.append("rolled back")
            raise

    db.begin_nested = begin_nested
    db.savepoints = savepoints
    return db


async def test_an_existing_row_is_returned_without_inserting():
    room_id = uuid.uuid4()
    existing = RoomDecoration(room_id=room_id)
    db = _db(existing)
    assert await get_or_create_room_row(db, RoomDecoration, room_id, walls={}) is existing
    db.add.assert_not_called()


async def test_a_missing_row_is_created_with_the_defaults():
    room_id = uuid.uuid4()
    db = _db(None)
    row = await get_or_create_room_row(db, RoomDecoration, room_id, walls={}, furniture=[])
    assert (row.room_id, row.walls, row.furniture) == (room_id, {}, [])
    db.add.assert_called_once_with(row)


async def test_losing_the_race_returns_the_row_the_other_request_created():
    room_id = uuid.uuid4()
    winner = RoomDecoration(room_id=room_id)
    db = _db(None, winner, flush_error=IntegrityError("INSERT", {}, Exception("duplicate key")))
    assert await get_or_create_room_row(db, RoomDecoration, room_id, walls={}) is winner
    assert db.savepoints == ["open", "rolled back"]  # only the savepoint, not the request


@pytest.mark.parametrize(
    ("module", "helper"),
    [
        ("app.routers.decoration", "_get_or_create_decoration"),
        ("app.routers.electrical", "_get_or_create_plan"),
        ("app.routers.room_state", "_get_or_default_state"),
    ],
)
async def test_every_per_room_table_goes_through_it(module, helper, monkeypatch):
    import importlib

    mod = importlib.import_module(module)
    called = AsyncMock(return_value="row")
    monkeypatch.setattr(mod, "get_or_create_room_row", called, raising=False)
    assert await getattr(mod, helper)(uuid.uuid4(), MagicMock()) == "row"
    called.assert_awaited_once()
