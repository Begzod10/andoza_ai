from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.apartment import Apartment
from app.models.room import Room


async def get_owned_room(room_id: UUID, user_id: UUID, db: AsyncSession) -> Room:
    """
    Load a non-deleted Room while verifying it belongs (transitively, via its
    Apartment) to *user_id*. Raises 404 if the room doesn't exist or isn't
    owned by this user — the same response for both cases, so ownership
    cannot be probed by ID enumeration.
    """
    result = await db.execute(
        select(Room)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(Room.id == room_id, Apartment.user_id == user_id, Room.deleted == False)
    )
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room
