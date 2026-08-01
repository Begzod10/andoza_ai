"""Decoration router — persists walls/floor/ceiling/furniture selections per room.

Endpoints
---------
GET /rooms/{room_id}/decoration → current decoration selections
PUT /rooms/{room_id}/decoration → save decoration choices
"""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.decoration import RoomDecoration
from app.schemas.decoration import DecorationOut, DecorationUpdate
from app.services.room_access import get_owned_room

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/rooms/{room_id}/decoration", tags=["decoration"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_decoration(room_id: UUID, db: DbSession) -> RoomDecoration:
    result = await db.execute(select(RoomDecoration).where(RoomDecoration.room_id == room_id))
    decoration = result.scalar_one_or_none()
    if decoration is None:
        decoration = RoomDecoration(room_id=room_id, walls={}, floor={}, ceiling={}, furniture=[])
        db.add(decoration)
        await db.flush()
    return decoration


def _decoration_out(room_id: UUID, decoration: RoomDecoration) -> DecorationOut:
    return DecorationOut(
        room_id=room_id,
        walls=decoration.walls or {},
        floor=decoration.floor or {},
        ceiling=decoration.ceiling or {},
        furniture=decoration.furniture or [],
        updated_at=decoration.updated_at,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=DecorationOut, summary="Get decoration selections for a room")
async def get_decoration(room_id: UUID, db: DbSession, current_user: CurrentUser) -> DecorationOut:
    room = await get_owned_room(room_id, current_user.id, db)
    decoration = await _get_or_create_decoration(room.id, db)
    return _decoration_out(room.id, decoration)


@router.put("", response_model=DecorationOut, summary="Save decoration selections for a room")
async def replace_decoration(
    room_id: UUID, body: DecorationUpdate, db: DbSession, current_user: CurrentUser
) -> DecorationOut:
    room = await get_owned_room(room_id, current_user.id, db)
    decoration = await _get_or_create_decoration(room.id, db)

    decoration.walls = body.walls.model_dump(mode="json")
    decoration.floor = body.floor.model_dump(mode="json")
    decoration.ceiling = body.ceiling.model_dump(mode="json")
    decoration.furniture = [f.model_dump(mode="json") for f in body.furniture]

    await db.flush()
    await db.refresh(decoration)
    logger.info("decoration_replaced", room_id=str(room_id), furniture_count=len(body.furniture))
    return _decoration_out(room.id, decoration)
