"""Electrical plan router — persists device placements per room.

Endpoints
---------
GET   /rooms/{room_id}/electrical                 → full plan (devices + wiring_meters)
PUT   /rooms/{room_id}/electrical                  → replace the whole plan
POST  /rooms/{room_id}/electrical/devices          → create a single device
GET   /rooms/{room_id}/electrical/devices          → list devices only
PATCH /rooms/{room_id}/electrical/devices/{id}     → partially update a device
DELETE /rooms/{room_id}/electrical/devices/{id}    → remove a device
"""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import delete, select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.electrical import ElectricalDevice, RoomElectrical
from app.schemas.electrical import (
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    ElectricalPlanOut,
    ElectricalPlanUpdate,
)
from app.services.room_access import get_owned_room

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/rooms/{room_id}/electrical", tags=["electrical"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_plan(room_id: UUID, db: DbSession) -> RoomElectrical:
    result = await db.execute(select(RoomElectrical).where(RoomElectrical.room_id == room_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        plan = RoomElectrical(room_id=room_id, wiring_meters=None)
        db.add(plan)
        await db.flush()
    return plan


async def _list_devices(room_id: UUID, db: DbSession) -> list[ElectricalDevice]:
    result = await db.execute(
        select(ElectricalDevice).where(ElectricalDevice.room_id == room_id).order_by(ElectricalDevice.created_at)
    )
    return list(result.scalars().all())


async def _get_owned_device(room_id: UUID, device_id: UUID, db: DbSession) -> ElectricalDevice:
    result = await db.execute(
        select(ElectricalDevice).where(
            ElectricalDevice.id == device_id, ElectricalDevice.room_id == room_id
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


def _plan_out(room_id: UUID, plan: RoomElectrical, devices: list[ElectricalDevice]) -> ElectricalPlanOut:
    return ElectricalPlanOut(
        room_id=room_id,
        devices=[DeviceOut.model_validate(d) for d in devices],
        wiring_meters=float(plan.wiring_meters) if plan.wiring_meters is not None else None,
        updated_at=plan.updated_at,
    )


# ---------------------------------------------------------------------------
# Whole-plan routes
# ---------------------------------------------------------------------------

@router.get("", response_model=ElectricalPlanOut, summary="Get the electrical plan for a room")
async def get_electrical_plan(room_id: UUID, db: DbSession, current_user: CurrentUser) -> ElectricalPlanOut:
    room = await get_owned_room(room_id, current_user.id, db)
    plan = await _get_or_create_plan(room.id, db)
    devices = await _list_devices(room.id, db)
    return _plan_out(room.id, plan, devices)


@router.put("", response_model=ElectricalPlanOut, summary="Replace the entire electrical plan")
async def replace_electrical_plan(
    room_id: UUID, body: ElectricalPlanUpdate, db: DbSession, current_user: CurrentUser
) -> ElectricalPlanOut:
    room = await get_owned_room(room_id, current_user.id, db)
    plan = await _get_or_create_plan(room.id, db)

    plan.wiring_meters = body.wiring_meters

    # Full replace: drop existing devices, insert the incoming set.
    await db.execute(delete(ElectricalDevice).where(ElectricalDevice.room_id == room.id))
    new_devices = [
        ElectricalDevice(
            room_id=room.id,
            type=d.type,
            variant=d.variant,
            wall_index=d.wall_index,
            x=d.x,
            y=d.y,
            count=d.count,
        )
        for d in body.devices
    ]
    db.add_all(new_devices)
    await db.flush()
    await db.refresh(plan)

    logger.info("electrical_plan_replaced", room_id=str(room_id), device_count=len(new_devices))
    return _plan_out(room.id, plan, new_devices)


# ---------------------------------------------------------------------------
# Device-level routes
# ---------------------------------------------------------------------------

@router.get("/devices", response_model=list[DeviceOut], summary="List devices for a room")
async def list_devices(room_id: UUID, db: DbSession, current_user: CurrentUser) -> list[DeviceOut]:
    room = await get_owned_room(room_id, current_user.id, db)
    devices = await _list_devices(room.id, db)
    return [DeviceOut.model_validate(d) for d in devices]


@router.post(
    "/devices",
    response_model=DeviceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a single device to the plan",
)
async def create_device(
    room_id: UUID, body: DeviceCreate, db: DbSession, current_user: CurrentUser
) -> DeviceOut:
    room = await get_owned_room(room_id, current_user.id, db)
    await _get_or_create_plan(room.id, db)  # ensure the plan header exists

    device = ElectricalDevice(
        room_id=room.id,
        type=body.type,
        variant=body.variant,
        wall_index=body.wall_index,
        x=body.x,
        y=body.y,
        count=body.count,
    )
    db.add(device)
    await db.flush()
    logger.info("electrical_device_created", room_id=str(room_id), device_id=str(device.id))
    return DeviceOut.model_validate(device)


@router.patch("/devices/{device_id}", response_model=DeviceOut, summary="Partially update a device")
async def update_device(
    room_id: UUID, device_id: UUID, body: DeviceUpdate, db: DbSession, current_user: CurrentUser
) -> DeviceOut:
    room = await get_owned_room(room_id, current_user.id, db)
    device = await _get_owned_device(room.id, device_id, db)

    if body.type is not None:
        device.type = body.type
    if body.variant is not None:
        device.variant = body.variant
    if body.wall_index is not None:
        device.wall_index = body.wall_index
    if body.x is not None:
        device.x = body.x
    if body.y is not None:
        device.y = body.y
    if body.count is not None:
        device.count = body.count

    await db.flush()
    await db.refresh(device)
    logger.info("electrical_device_updated", room_id=str(room_id), device_id=str(device_id))
    return DeviceOut.model_validate(device)


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a device",
)
async def delete_device(
    room_id: UUID, device_id: UUID, db: DbSession, current_user: CurrentUser
) -> Response:
    room = await get_owned_room(room_id, current_user.id, db)
    device = await _get_owned_device(room.id, device_id, db)
    await db.delete(device)
    await db.flush()
    logger.info("electrical_device_deleted", room_id=str(room_id), device_id=str(device_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
