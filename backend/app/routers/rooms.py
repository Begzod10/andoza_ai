from __future__ import annotations

import uuid as uuid_module
from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url, delete_file, upload_file
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomGeometry, RoomOut, RoomUpdate
from app.services.room_geometry import compute_metrics as _compute_metrics_impl

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["rooms"])

# Canvas exports only — this endpoint receives a client-side toDataURL()
# capture, not an arbitrary user upload, so the allowed set stays narrow.
_THUMBNAIL_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_THUMBNAIL_EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024  # 4 MB — a viewport snapshot, not a texture


def _with_thumbnail_url(out: RoomOut, room: Room, request: Request) -> RoomOut:
    out.thumbnail_url = absolute_media_url(request, room.thumbnail_key)
    return out


# ---------------------------------------------------------------------------
# Geometry helpers (thin wrappers — logic lives in app.services.room_geometry)
# ---------------------------------------------------------------------------

def _compute_metrics(geometry: RoomGeometry, ceiling_h: float) -> dict:
    return _compute_metrics_impl(geometry, ceiling_h)


async def _get_owned_apartment(apartment_id: UUID, user_id: object, db: DbSession) -> Apartment:
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id, Apartment.user_id == user_id)
    )
    apartment = result.scalar_one_or_none()
    if apartment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apartment not found")
    return apartment


async def _get_owned_room(room_id: UUID, user_id: object, db: DbSession) -> Room:
    result = await db.execute(
        select(Room)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(Room.id == room_id, Apartment.user_id == user_id, Room.deleted == False)
    )
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/apartments/{apt_id}/rooms",
    response_model=RoomOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a room inside an apartment",
)
async def create_room(apt_id: UUID, body: RoomCreate, db: DbSession, current_user: CurrentUser) -> RoomOut:
    await _get_owned_apartment(apt_id, current_user.id, db)

    metrics = _compute_metrics(body.geometry, body.ceiling_h)

    room = Room(
        apartment_id=apt_id,
        name=body.name,
        ceiling_h=body.ceiling_h,
        geometry=body.geometry.model_dump(),
        **metrics,
    )
    db.add(room)
    await db.flush()
    logger.info("room_created", room_id=str(room.id), apt_id=str(apt_id))
    return RoomOut.model_validate(room)


@router.get(
    "/apartments/{apt_id}/rooms",
    response_model=list[RoomOut],
    summary="List all rooms of an apartment with full details",
)
async def list_rooms(apt_id: UUID, db: DbSession, current_user: CurrentUser, request: Request) -> list[RoomOut]:
    await _get_owned_apartment(apt_id, current_user.id, db)
    result = await db.execute(
        select(Room)
        # updated_at shifts on every edit, which would reshuffle the top-view
        # layout — order by id for a stable (if arbitrary) room order.
        .where(Room.apartment_id == apt_id, Room.deleted == False)
        .order_by(Room.id)
    )
    return [
        _with_thumbnail_url(RoomOut.model_validate(r), r, request)
        for r in result.scalars().all()
    ]


@router.get(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Get full room details",
)
async def get_room(room_id: UUID, db: DbSession, current_user: CurrentUser, request: Request) -> RoomOut:
    room = await _get_owned_room(room_id, current_user.id, db)
    return _with_thumbnail_url(RoomOut.model_validate(room), room, request)


@router.patch(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Partially update a room; recomputes metrics when geometry changes",
)
async def update_room(
    room_id: UUID, body: RoomUpdate, db: DbSession, current_user: CurrentUser, request: Request
) -> RoomOut:
    room = await _get_owned_room(room_id, current_user.id, db)

    if body.name is not None:
        room.name = body.name
    if body.surfaces is not None:
        room.surfaces = body.surfaces
    if body.furniture_layout is not None:
        room.furniture_layout = body.furniture_layout
    if body.state is not None:
        room.state = body.state

    # Geometry or ceiling height change triggers metric recomputation
    geometry_changed = body.geometry is not None
    ceiling_changed = body.ceiling_h is not None

    if body.ceiling_h is not None:
        room.ceiling_h = body.ceiling_h
    if body.geometry is not None:
        room.geometry = body.geometry.model_dump()

    if geometry_changed or ceiling_changed:
        active_geometry = (
            body.geometry
            if body.geometry is not None
            else RoomGeometry.model_validate(room.geometry)
        )
        active_ceiling = float(room.ceiling_h) if room.ceiling_h is not None else 0.0
        metrics = _compute_metrics(active_geometry, active_ceiling)
        room.floor_area = metrics["floor_area"]
        room.perimeter = metrics["perimeter"]
        room.net_wall_area = metrics["net_wall_area"]
        room.openings_count = metrics["openings_count"]

    await db.flush()
    await db.refresh(room)
    logger.info("room_updated", room_id=str(room_id))
    return _with_thumbnail_url(RoomOut.model_validate(room), room, request)


@router.post(
    "/rooms/{room_id}/thumbnail",
    response_model=RoomOut,
    summary="Upload a captured 3D-viewport snapshot as the room's project-card thumbnail",
)
async def upload_room_thumbnail(
    room_id: UUID,
    file: UploadFile,
    db: DbSession,
    current_user: CurrentUser,
    request: Request,
) -> RoomOut:
    """Replace the room's thumbnail with a client-captured canvas snapshot.

    The studio calls this after `canvas.toDataURL()`, not with an arbitrary
    user file — hence the narrow content-type set and small size cap versus
    the wallpaper library upload. The previous image (if any) is deleted once
    the new one is safely stored, so a room never keeps more than one.
    """
    room = await _get_owned_room(room_id, current_user.id, db)

    if file.content_type not in _THUMBNAIL_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Faqat rasm yuklash mumkin ({', '.join(sorted(_THUMBNAIL_EXT_BY_TYPE.values()))})",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bo'sh fayl yuborildi")
    if len(file_bytes) > _THUMBNAIL_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Rasm hajmi {_THUMBNAIL_MAX_BYTES // (1024 * 1024)} MB dan oshmasligi kerak",
        )

    ext = _THUMBNAIL_EXT_BY_TYPE.get(file.content_type or "", "jpg")
    key = f"thumbnails/{room_id}/{uuid_module.uuid4()}.{ext}"
    try:
        stored_url = upload_file(file_bytes, key, content_type=file.content_type or "image/jpeg")
    except Exception as exc:
        logger.error("room_thumbnail_upload_failed", room_id=str(room_id), error=str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Rasmni saqlab bo'lmadi") from exc

    old_key = room.thumbnail_key
    # S3 hands back an absolute URL; local storage a key under MEDIA_ROOT —
    # same shape the wallpaper library stores, so public_url() handles both.
    room.thumbnail_key = stored_url if stored_url.startswith("http") else key
    await db.flush()
    await db.refresh(room)

    if old_key and old_key != room.thumbnail_key:
        try:
            delete_file(old_key)
        except Exception as exc:  # the new thumbnail is already saved; a stray old file is not worth a 500
            logger.warning("room_thumbnail_old_file_delete_failed", key=old_key, error=str(exc))

    logger.info("room_thumbnail_uploaded", room_id=str(room_id))
    return _with_thumbnail_url(RoomOut.model_validate(room), room, request)


@router.delete(
    "/rooms/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a room (soft delete)",
)
async def delete_room(room_id: UUID, db: DbSession, current_user: CurrentUser) -> Response:
    room = await _get_owned_room(room_id, current_user.id, db)
    room.deleted = True
    await db.flush()
    logger.info("room_deleted", room_id=str(room_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Wall & Opening CRUD endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/rooms/{room_id}/walls",
    response_model=RoomOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new wall to room geometry",
)
async def add_wall(room_id: UUID, wall: dict, db: DbSession, current_user: CurrentUser) -> RoomOut:
    """
    Add a new wall to the room's geometry.

    Wall should be a dict with: id (optional, auto-generated), length, elements.
    After adding, geometry is re-validated and metrics are recomputed.

    Args:
        room_id: Room UUID
        wall: Wall dict (length: float, elements: list, id: optional str)
        db: Database session
        current_user: Current authenticated user

    Returns:
        Updated RoomOut with new wall added
    """
    from app.schemas.room import Wall, WallElement

    room = await _get_owned_room(room_id, current_user.id, db)

    # Parse wall
    if "id" not in wall:
        import uuid
        wall["id"] = str(uuid.uuid4())

    wall_obj = Wall(**wall)

    # Add to geometry
    geometry_dict = room.geometry or {"walls": [], "vertices": None}
    geometry_dict["walls"].append(wall_obj.model_dump())

    # Validate new geometry
    geom = RoomGeometry(**geometry_dict)
    metrics = _compute_metrics(geom, room.ceiling_h)

    # Update room
    room.geometry = geom.model_dump()
    room.floor_area = metrics.get("floor_area")
    room.net_wall_area = metrics.get("net_wall_area")
    room.perimeter = metrics.get("perimeter")
    room.openings_count = metrics.get("openings_count")

    await db.flush()
    await db.refresh(room)
    logger.info("wall_added", room_id=str(room_id))
    return RoomOut.model_validate(room)


@router.patch(
    "/rooms/{room_id}/walls/{wall_id}",
    response_model=RoomOut,
    summary="Update a wall in room geometry",
)
async def update_wall(
    room_id: UUID, wall_id: str, wall_update: dict, db: DbSession, current_user: CurrentUser
) -> RoomOut:
    """
    Update an existing wall by ID.

    Updates wall length and/or elements (openings).

    Args:
        room_id: Room UUID
        wall_id: Wall ID (UUID string)
        wall_update: Dict with length and/or elements to update
        db: Database session
        current_user: Current authenticated user

    Returns:
        Updated RoomOut with wall modified
    """
    room = await _get_owned_room(room_id, current_user.id, db)

    geometry_dict = room.geometry or {"walls": [], "vertices": None}
    geom = RoomGeometry(**geometry_dict)

    # Find wall by ID
    wall_idx = None
    for i, wall in enumerate(geom.walls):
        if wall.id == wall_id:
            wall_idx = i
            break

    if wall_idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    # Update wall
    if "length" in wall_update:
        geom.walls[wall_idx].length = wall_update["length"]
    if "elements" in wall_update:
        geom.walls[wall_idx].elements = wall_update["elements"]

    # Validate and compute metrics
    metrics = _compute_metrics(geom, room.ceiling_h)

    room.geometry = geom.model_dump()
    room.floor_area = metrics.get("floor_area")
    room.net_wall_area = metrics.get("net_wall_area")
    room.perimeter = metrics.get("perimeter")
    room.openings_count = metrics.get("openings_count")

    await db.flush()
    await db.refresh(room)
    logger.info("wall_updated", room_id=str(room_id), wall_id=wall_id)
    return RoomOut.model_validate(room)


@router.post(
    "/rooms/{room_id}/walls/{wall_id}/openings",
    response_model=RoomOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add an opening (door/window) to a wall",
)
async def add_opening(
    room_id: UUID, wall_id: str, opening: dict, db: DbSession, current_user: CurrentUser
) -> RoomOut:
    """
    Add an opening (door or window) to a wall.

    Opening should be a dict with: type, width, height, sill_height, position.
    ID is auto-generated if not provided.

    Args:
        room_id: Room UUID
        wall_id: Wall ID
        opening: Opening dict
        db: Database session
        current_user: Current authenticated user

    Returns:
        Updated RoomOut with opening added to wall
    """
    from app.schemas.room import WallElement
    import uuid

    room = await _get_owned_room(room_id, current_user.id, db)

    geometry_dict = room.geometry or {"walls": [], "vertices": None}
    geom = RoomGeometry(**geometry_dict)

    # Find wall by ID
    wall_idx = None
    for i, wall in enumerate(geom.walls):
        if wall.id == wall_id:
            wall_idx = i
            break

    if wall_idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    # Add opening ID if not present
    if "id" not in opening:
        opening["id"] = str(uuid.uuid4())

    # Validate opening against ceiling height
    opening_height = opening.get("height", 0)
    opening_sill = opening.get("sill_height", 0)
    if opening_height + opening_sill > room.ceiling_h + 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Opening height exceeds ceiling height",
        )

    element = WallElement(**opening)
    geom.walls[wall_idx].elements.append(element)

    # Validate and compute metrics
    metrics = _compute_metrics(geom, room.ceiling_h)

    room.geometry = geom.model_dump()
    room.floor_area = metrics.get("floor_area")
    room.net_wall_area = metrics.get("net_wall_area")
    room.perimeter = metrics.get("perimeter")
    room.openings_count = metrics.get("openings_count")

    await db.flush()
    await db.refresh(room)
    logger.info("opening_added", room_id=str(room_id), wall_id=wall_id)
    return RoomOut.model_validate(room)


@router.delete(
    "/rooms/{room_id}/walls/{wall_id}/openings/{opening_id}",
    response_model=RoomOut,
    summary="Remove an opening from a wall",
)
async def remove_opening(
    room_id: UUID, wall_id: str, opening_id: str, db: DbSession, current_user: CurrentUser
) -> RoomOut:
    """
    Delete an opening from a wall.

    Args:
        room_id: Room UUID
        wall_id: Wall ID
        opening_id: Opening ID (UUID string)
        db: Database session
        current_user: Current authenticated user

    Returns:
        Updated RoomOut with opening removed

    Raises:
        HTTPException: 404 if wall or opening not found
    """
    room = await _get_owned_room(room_id, current_user.id, db)

    geometry_dict = room.geometry or {"walls": [], "vertices": None}
    geom = RoomGeometry(**geometry_dict)

    # Find wall by ID
    wall_idx = None
    for i, wall in enumerate(geom.walls):
        if wall.id == wall_id:
            wall_idx = i
            break

    if wall_idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    # Find and remove opening by ID
    element_idx = None
    for i, element in enumerate(geom.walls[wall_idx].elements):
        if element.id == opening_id:
            element_idx = i
            break

    if element_idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")

    geom.walls[wall_idx].elements.pop(element_idx)

    # Validate and compute metrics
    metrics = _compute_metrics(geom, room.ceiling_h)

    room.geometry = geom.model_dump()
    room.floor_area = metrics.get("floor_area")
    room.net_wall_area = metrics.get("net_wall_area")
    room.perimeter = metrics.get("perimeter")
    room.openings_count = metrics.get("openings_count")

    await db.flush()
    await db.refresh(room)
    logger.info("opening_removed", room_id=str(room_id), wall_id=wall_id, opening_id=opening_id)
    return RoomOut.model_validate(room)
