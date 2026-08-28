"""Room furniture placement endpoints.

Handles placement of furniture items in a room (position, rotation, z-index).
Endpoints follow REST conventions:
  POST   /rooms/{room_id}/furniture        — Place furniture in room
  GET    /rooms/{room_id}/furniture        — List all placements for room
  DELETE /rooms/{room_id}/furniture/{id}   — Remove furniture placement
"""

from __future__ import annotations

import structlog
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.models import RoomFurniturePlacement
from app.schemas.room_furniture import (
    FurniturePlacementCreate,
    FurniturePlacementOut,
    FurniturePlacementListOut,
)
from app.services.room_access import get_owned_room

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/rooms/{room_id}/furniture",
    tags=["furniture"],
)


@router.post("", response_model=FurniturePlacementOut, status_code=status.HTTP_201_CREATED)
async def place_furniture(
    room_id: UUID,
    placement: FurniturePlacementCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> FurniturePlacementOut:
    """Place furniture in a room, creating a new placement record."""
    room = await get_owned_room(room_id, current_user.id, db)

    new_placement = RoomFurniturePlacement(
        room_id=room.id,
        furniture_id=placement.furniture_id,
        x=placement.x,
        y=placement.y,
        rotation=placement.rotation,
        z_index=placement.z_index,
    )
    db.add(new_placement)
    await db.flush()
    await db.refresh(new_placement)

    logger.info(
        "furniture_placement_created",
        room_id=str(room.id),
        furniture_id=str(placement.furniture_id),
        user_id=str(current_user.id),
    )

    return FurniturePlacementOut.model_validate(new_placement)


@router.get("", response_model=FurniturePlacementListOut)
async def list_furniture_placements(
    room_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> FurniturePlacementListOut:
    """List all furniture placements for a room, ordered by z_index (stacking order)."""
    room = await get_owned_room(room_id, current_user.id, db)

    result = await db.execute(
        select(RoomFurniturePlacement)
        .where(RoomFurniturePlacement.room_id == room.id)
        .order_by(RoomFurniturePlacement.z_index.desc())
        .offset(offset)
        .limit(limit)
    )
    placements = list(result.scalars().all())

    count_result = await db.execute(
        select(func.count()).select_from(RoomFurniturePlacement).where(RoomFurniturePlacement.room_id == room.id)
    )
    count = count_result.scalar_one()

    return FurniturePlacementListOut(
        items=[FurniturePlacementOut.model_validate(p) for p in placements],
        count=count,
    )


@router.delete("/{placement_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_furniture(
    room_id: UUID,
    placement_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    """Remove a furniture placement from a room."""
    room = await get_owned_room(room_id, current_user.id, db)

    result = await db.execute(
        select(RoomFurniturePlacement).where(
            RoomFurniturePlacement.id == placement_id, RoomFurniturePlacement.room_id == room.id
        )
    )
    placement = result.scalar_one_or_none()
    if placement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Furniture placement not found")

    await db.delete(placement)
    await db.flush()

    logger.info(
        "furniture_placement_deleted",
        room_id=str(room.id),
        placement_id=str(placement_id),
        user_id=str(current_user.id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
