"""Room finishes (paint, wallpaper, tile, etc.) endpoints.

Handles per-surface finish selections (material, type, color).
Endpoints follow REST conventions:
  POST   /rooms/{room_id}/finishes         — Create/update a finish
  GET    /rooms/{room_id}/finishes         — List all finishes for room
  DELETE /rooms/{room_id}/finishes/{id}    — Remove a finish
"""

from __future__ import annotations

import structlog
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.models import RoomFinish
from app.schemas.room_finish import FinishCreate, FinishOut, FinishListOut
from app.services.room_access import get_owned_room
from app.services.room_finishes import validate_finish_surface

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/rooms/{room_id}/finishes",
    tags=["finishes"],
)


@router.post("", response_model=FinishOut, status_code=status.HTTP_201_CREATED)
async def create_or_update_finish(
    room_id: UUID,
    finish: FinishCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> FinishOut:
    """
    Create a new finish or update existing finish for a surface.

    If a finish for the same surface already exists, it is updated.
    Otherwise, a new one is created.

    ``surface`` may be ``floor``, ``ceiling``, a legacy ``wall_a``..``wall_d``
    alias, or — for a scanned/hand-drawn N-wall polygon — the room's own
    ``geometry.walls[].id``. It is validated against the room's real geometry
    rather than a hardcoded 4-wall list, so the 5th wall of a LiDAR scan can
    be finished (and therefore costed) like any other.
    """
    room = await get_owned_room(room_id, current_user.id, db)
    validate_finish_surface(room, finish.surface, finish.wall_index)

    result = await db.execute(
        select(RoomFinish).where(RoomFinish.room_id == room.id, RoomFinish.surface == finish.surface)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.material_id = finish.material_id
        existing.finish_type = finish.finish_type
        existing.color_hex = finish.color_hex
        existing.wall_index = finish.wall_index
        record = existing
        logger.info("finish_updated", room_id=str(room.id), surface=finish.surface, user_id=str(current_user.id))
    else:
        record = RoomFinish(
            room_id=room.id,
            surface=finish.surface,
            material_id=finish.material_id,
            finish_type=finish.finish_type,
            color_hex=finish.color_hex,
            wall_index=finish.wall_index,
        )
        db.add(record)
        logger.info("finish_created", room_id=str(room.id), surface=finish.surface, user_id=str(current_user.id))

    await db.flush()
    await db.refresh(record)
    return FinishOut.model_validate(record)


@router.get("", response_model=FinishListOut)
async def list_finishes(
    room_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> FinishListOut:
    """List all finishes for a room."""
    room = await get_owned_room(room_id, current_user.id, db)

    result = await db.execute(
        select(RoomFinish).where(RoomFinish.room_id == room.id).offset(offset).limit(limit)
    )
    finishes = list(result.scalars().all())

    count_result = await db.execute(
        select(func.count()).select_from(RoomFinish).where(RoomFinish.room_id == room.id)
    )
    count = count_result.scalar_one()

    return FinishListOut(
        items=[FinishOut.model_validate(f) for f in finishes],
        count=count,
    )


@router.delete("/{finish_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_finish(
    room_id: UUID,
    finish_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    """Delete a specific finish."""
    room = await get_owned_room(room_id, current_user.id, db)

    result = await db.execute(
        select(RoomFinish).where(RoomFinish.id == finish_id, RoomFinish.room_id == room.id)
    )
    finish = result.scalar_one_or_none()
    if finish is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Finish not found")

    await db.delete(finish)
    await db.flush()

    logger.info("finish_deleted", room_id=str(room.id), finish_id=str(finish_id), user_id=str(current_user.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
