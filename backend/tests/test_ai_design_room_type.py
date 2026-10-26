"""The designer's room type: the request's when it is a known type, otherwise the room's stored one.

Older clients send no room type and a free-text field can carry anything; the room itself
keeps its type (rooms.room_type), so the designer still knows a bedroom is a bedroom.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.routers.ai import _run_design
from app.services.ai_designer import DesignPlan

PLAN = DesignPlan(title="t", summary="s", walls={}, floor={}, lights=[], furniture=[])


async def _designed_room_type(request_type: str | None, stored_type: str | None) -> str | None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    room = SimpleNamespace(name="Xona", ceiling_h=2.7, geometry=None, room_type=stored_type)
    design = AsyncMock(return_value=PLAN)
    with patch("app.routers.ai.design_room", new=design):
        await _run_design(room, "sokin xona", request_type, db, "user-1")
    return design.await_args.args[1]["room_type"]


async def test_without_a_requested_type_the_stored_type_is_used():
    assert await _designed_room_type(None, "yotoqxona") == "yotoqxona"


async def test_an_unknown_requested_type_is_ignored_for_the_stored_one():
    assert await _designed_room_type("garbage", "yotoqxona") == "yotoqxona"


async def test_a_known_requested_type_overrides_the_stored_one():
    assert await _designed_room_type("bolalar", "yotoqxona") == "bolalar"


async def test_neither_gives_no_type():
    assert await _designed_room_type("garbage", None) is None
