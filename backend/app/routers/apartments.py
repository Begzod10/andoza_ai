from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.apartment import ApartmentCreate, ApartmentOut, ApartmentUpdate, ApartmentWithRooms

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/apartments", tags=["apartments"])


def _with_room_thumbnails(out: ApartmentWithRooms, apartment: Apartment, request: Request) -> ApartmentWithRooms:
    """RoomOut.model_validate() (used implicitly when Pydantic builds the
    nested `rooms` list) has no request to resolve an absolute URL from, so
    thumbnail_url comes back None unless filled in here afterwards — same
    zero-arg limitation as the standalone rooms router.

    Pydantic builds `out.rooms` by iterating `apartment.rooms` in order
    without reordering, so zipping the two lists pairs each schema object
    back up with the ORM row it came from.
    """
    for room_out, room in zip(out.rooms, apartment.rooms):
        room_out.thumbnail_url = absolute_media_url(request, room.thumbnail_key)
    return out


@router.get(
    "",
    response_model=list[ApartmentWithRooms],
    summary="List all apartments with their rooms",
)
async def list_apartments(
    db: DbSession, current_user: CurrentUser, request: Request, include_deleted: bool = False
) -> list[ApartmentWithRooms]:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.user_id == current_user.id)
        .options(selectinload(Apartment.rooms))
        .order_by(Apartment.created_at.desc())
    )
    apartments = result.scalars().all()
    # Filter deleted rooms unless include_deleted is True
    if not include_deleted:
        for apt in apartments:
            if apt.rooms:
                apt.rooms = [r for r in apt.rooms if not r.deleted]
    return [
        _with_room_thumbnails(ApartmentWithRooms.model_validate(a), a, request)
        for a in apartments
    ]


@router.post(
    "",
    response_model=ApartmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new apartment",
)
async def create_apartment(body: ApartmentCreate, db: DbSession, current_user: CurrentUser) -> ApartmentOut:
    apartment = Apartment(
        user_id=current_user.id,
        name=body.name,
        address=body.address,
        developer=body.developer,
    )
    db.add(apartment)
    await db.flush()
    logger.info("apartment_created", apartment_id=str(apartment.id))
    return ApartmentOut.model_validate(apartment)


@router.get(
    "/{apartment_id}",
    response_model=ApartmentWithRooms,
    summary="Get apartment with rooms list",
)
async def get_apartment(
    apartment_id: UUID, db: DbSession, current_user: CurrentUser, request: Request, include_deleted: bool = False
) -> ApartmentWithRooms:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.user_id == current_user.id)
        .options(selectinload(Apartment.rooms))
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    # Filter out deleted rooms unless include_deleted is True
    if not include_deleted and apartment.rooms:
        apartment.rooms = [r for r in apartment.rooms if not r.deleted]
    return _with_room_thumbnails(ApartmentWithRooms.model_validate(apartment), apartment, request)


@router.patch(
    "/{apartment_id}",
    response_model=ApartmentWithRooms,
    summary="Update apartment fields",
)
async def update_apartment(
    apartment_id: UUID, body: ApartmentUpdate, db: DbSession, current_user: CurrentUser, request: Request
) -> ApartmentWithRooms:
    result = await db.execute(
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.user_id == current_user.id)
        .options(selectinload(Apartment.rooms))
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in updates.items():
        setattr(apartment, field, value)
    await db.flush()
    logger.info("apartment_updated", apartment_id=str(apartment_id), fields=list(updates.keys()))
    apartment.rooms = [r for r in apartment.rooms if not r.deleted]
    return _with_room_thumbnails(ApartmentWithRooms.model_validate(apartment), apartment, request)


@router.delete(
    "/{apartment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete apartment",
)
async def delete_apartment(apartment_id: UUID, db: DbSession, current_user: CurrentUser) -> None:
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id, Apartment.user_id == current_user.id)
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    await db.delete(apartment)
    logger.info("apartment_deleted", apartment_id=str(apartment_id))
