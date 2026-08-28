"""Room construction-progress state + delta calculation router.

Endpoints
---------
GET   /rooms/{room_id}/state   → current RoomState (auto-defaults to "xom")
POST  /rooms/{room_id}/state   → create or fully replace the state
PATCH /rooms/{room_id}/state   → partially update the state
GET   /rooms/{room_id}/delta   → material/cost DIFFERENCE between the room's
                                  current state and a fully-finished room
"""
from __future__ import annotations

import uuid as uuid_mod
from uuid import UUID

import structlog
from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.models.material import Material
from app.models.norm import Norm
from app.models.room_state import RoomState
from app.schemas.delta import DeltaResponse, DeltaStage
from app.schemas.estimate import EstimateLine
from app.schemas.room_state import RoomStateIn, RoomStateOut, RoomStatePatch
from app.services.delta import compute_delta
from app.services.smeta import ComputedLine
from app.services.room_access import get_owned_room

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/rooms/{room_id}", tags=["room-state"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_default_state(room_id: UUID, db: DbSession) -> RoomState:
    """Load the room's state row, creating a default 'xom' row if absent.

    Every room implicitly starts as raw (korobka) until the user records
    otherwise, so callers always get a usable RoomState instead of a 404.
    """
    result = await db.execute(select(RoomState).where(RoomState.room_id == room_id))
    state = result.scalar_one_or_none()
    if state is None:
        state = RoomState(room_id=room_id, current_state="xom")
        db.add(state)
        await db.flush()
    return state


async def _load_materials_for_room(room, db: DbSession) -> dict[str, Material]:
    surfaces: dict = room.surfaces or {}
    raw_ids = [v for v in surfaces.values() if v]
    if not raw_ids:
        return {}
    try:
        mid_uuids = [uuid_mod.UUID(str(mid)) for mid in raw_ids]
    except ValueError:
        return {}
    result = await db.execute(
        select(Material).options(selectinload(Material.store)).where(Material.id.in_(mid_uuids))
    )
    return {str(m.id): m for m in result.scalars().all()}


async def _load_norms(db: DbSession) -> dict[str, Norm]:
    result = await db.execute(select(Norm))
    return {n.material_key: n for n in result.scalars().all()}


def _to_estimate_lines(lines: list[ComputedLine]) -> list[EstimateLine]:
    return [
        EstimateLine(
            label=ln.label,
            formula=ln.formula,
            quantity=ln.qty,
            unit=ln.unit,
            unit_price=ln.unit_price_uzs,
            total_uzs=ln.subtotal_uzs,
            is_approximate=ln.is_approximate,
            store_id=None,
            category=ln.category,
        )
        for ln in lines
    ]


# ---------------------------------------------------------------------------
# State routes
# ---------------------------------------------------------------------------

@router.get("/state", response_model=RoomStateOut, summary="Get room construction-progress state")
async def get_room_state(room_id: UUID, db: DbSession, current_user: CurrentUser) -> RoomStateOut:
    room = await get_owned_room(room_id, current_user.id, db)
    state = await _get_or_default_state(room.id, db)
    return RoomStateOut.model_validate(state)


@router.post(
    "/state",
    response_model=RoomStateOut,
    status_code=status.HTTP_200_OK,
    summary="Create or fully replace the room's construction-progress state",
)
async def set_room_state(
    room_id: UUID, body: RoomStateIn, db: DbSession, current_user: CurrentUser
) -> RoomStateOut:
    room = await get_owned_room(room_id, current_user.id, db)
    state = await _get_or_default_state(room.id, db)

    state.current_state = body.current_state
    state.floor_state = body.floor_state
    state.ceiling_state = body.ceiling_state
    state.walls_state = body.walls_state

    await db.flush()
    await db.refresh(state)
    logger.info("room_state_set", room_id=str(room_id), current_state=body.current_state)
    return RoomStateOut.model_validate(state)


@router.patch(
    "/state",
    response_model=RoomStateOut,
    summary="Partially update the room's construction-progress state",
)
async def patch_room_state(
    room_id: UUID, body: RoomStatePatch, db: DbSession, current_user: CurrentUser
) -> RoomStateOut:
    room = await get_owned_room(room_id, current_user.id, db)
    state = await _get_or_default_state(room.id, db)

    if body.current_state is not None:
        state.current_state = body.current_state
    if body.floor_state is not None:
        state.floor_state = body.floor_state
    if body.ceiling_state is not None:
        state.ceiling_state = body.ceiling_state
    if body.walls_state is not None:
        state.walls_state = body.walls_state

    await db.flush()
    await db.refresh(state)
    logger.info("room_state_patched", room_id=str(room_id))
    return RoomStateOut.model_validate(state)


# ---------------------------------------------------------------------------
# Delta route
# ---------------------------------------------------------------------------

@router.get(
    "/delta",
    response_model=DeltaResponse,
    summary="Compute material/cost DIFFERENCE between current state and a finished room",
)
async def get_room_delta(room_id: UUID, db: DbSession, current_user: CurrentUser) -> DeltaResponse:
    room = await get_owned_room(room_id, current_user.id, db)
    state = await _get_or_default_state(room.id, db)
    materials_map = await _load_materials_for_room(room, db)
    norms_map = await _load_norms(db)

    result = compute_delta(room, state, materials_map, norms_map)

    return DeltaResponse(
        room_id=room.id,
        current_state=state.current_state,
        full_lines=_to_estimate_lines(result.full_estimate.lines),
        full_total_uzs=result.full_estimate.total_uzs,
        delta_lines=_to_estimate_lines(result.delta_estimate.lines),
        delta_total_uzs=result.delta_estimate.total_uzs,
        delta_savings_uzs=result.delta_savings_uzs,
        completed_stages=[
            DeltaStage(stage=s.stage, label_uz=s.label_uz, already_done=s.already_done)
            for s in result.completed_stages
        ],
        remaining_stages=[
            DeltaStage(stage=s.stage, label_uz=s.label_uz, already_done=s.already_done)
            for s in result.remaining_stages
        ],
    )
