"""An usta runs one public profile and appears in the catalog once approved.

An usta is a user who owns an ``ustalar`` row (``ustalar.owner_user_id``). Like
the seller router, everything here acts on the caller's own profile — it is
looked up from the caller, never from an id in the request. A new application
starts pending and inactive and reaches the public list only once an admin
approves it (see ``routers/admin_moderation.py``).
"""
from __future__ import annotations

import structlog
import uuid as uuid_module

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.lead import Lead
from app.models.room import Room
from app.models.usta import Usta
from app.models.user import User
from app.routers.admin_catalog import _invalidate_after_commit
from app.schemas.usta_profile import UstaApply, UstaLeadOut, UstaLeadUpdate, UstaProfileOut, UstaProfileUpdate

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/usta", tags=["usta"])


async def _own_profile(db: DbSession, user) -> Usta | None:
    return (await db.execute(select(Usta).where(Usta.owner_user_id == user.id))).scalar_one_or_none()


async def _require_profile(db: DbSession, user) -> Usta:
    usta = await _own_profile(db, user)
    if usta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sizda usta profili yo'q")
    return usta


@router.get(
    "/profile",
    response_model=UstaProfileOut | None,
    summary="The caller's own usta profile, or null if they have none",
)
async def get_profile(current_user: CurrentUser, db: DbSession) -> Usta | None:
    # null, not 404: "no profile yet" is the normal first state.
    return await _own_profile(db, current_user)


@router.post(
    "/profile",
    response_model=UstaProfileOut,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to be listed as an usta (waits for an admin)",
)
async def apply_as_usta(body: UstaApply, current_user: CurrentUser, db: DbSession) -> Usta:
    if await _own_profile(db, current_user) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sizda allaqachon usta profili bor")
    usta = Usta(
        name=body.name.strip(),
        category=body.category,
        district=body.district,
        phone=body.phone,
        telegram=body.telegram,
        price_min=body.price_min,
        price_max=body.price_max,
        owner_user_id=current_user.id,
        rating=0,
        jobs_count=0,
        verified=False,
        status="pending",
        is_active=False,
    )
    db.add(usta)
    await db.flush()
    await db.refresh(usta)
    logger.info("usta_applied", usta_id=str(usta.id), user_id=str(current_user.id))
    return usta


@router.post(
    "/profile/resubmit",
    response_model=UstaProfileOut,
    summary="Send a rejected usta application back for review",
)
async def resubmit_profile(current_user: CurrentUser, db: DbSession) -> Usta:
    usta = await _require_profile(db, current_user)
    if usta.status != "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Faqat rad etilgan ariza qayta yuboriladi")
    usta.status = "pending"
    usta.moderation_note = None
    await db.flush()
    await db.refresh(usta)
    return usta


@router.patch("/profile", response_model=UstaProfileOut, summary="Edit the caller's own usta profile")
async def update_profile(body: UstaProfileUpdate, current_user: CurrentUser, db: DbSession) -> Usta:
    usta = await _require_profile(db, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None:
            value = value.strip()
        if field in ("name", "category", "phone") and value is None:
            continue  # these three are required on the row; null would be a 500
        setattr(usta, field, value)
    if (
        usta.price_min is not None
        and usta.price_max is not None
        and usta.price_max < usta.price_min
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Maksimal narx minimaldan kam bo'lmasligi kerak")
    await db.flush()
    await db.refresh(usta)
    if usta.status == "approved":
        _invalidate_after_commit(db, "ustalar:")
    return usta


# --------------------------------------------------------------------------- #
# Customer requests (leads)
# --------------------------------------------------------------------------- #

def _lead_out(lead: Lead, client: User | None, room: Room | None) -> UstaLeadOut:
    snap = lead.smeta_snapshot or {}
    return UstaLeadOut(
        id=lead.id,
        status=lead.status,
        created_at=lead.created_at,
        client_name=client.name if client else None,
        client_phone=client.phone if client else None,
        room_name=room.name if room else None,
        total_uzs=snap.get("total_uzs"),
        lines_count=len(snap.get("lines") or []),
    )


@router.get("/leads", response_model=list[UstaLeadOut], summary="Customer requests sent to the caller's usta profile")
async def list_leads(current_user: CurrentUser, db: DbSession) -> list[UstaLeadOut]:
    usta = await _require_profile(db, current_user)
    rows = (await db.execute(
        select(Lead, User, Room)
        .join(User, User.id == Lead.user_id)
        .outerjoin(Room, Room.id == Lead.room_id)
        .where(Lead.usta_id == usta.id)
        .order_by(Lead.created_at.desc())
        .limit(200)
    )).all()
    return [_lead_out(lead, client, room) for lead, client, room in rows]


@router.patch("/leads/{lead_id}", response_model=UstaLeadOut, summary="Mark one of the caller's leads viewed / contacted / closed")
async def update_lead(lead_id: uuid_module.UUID, body: UstaLeadUpdate, current_user: CurrentUser, db: DbSession) -> UstaLeadOut:
    usta = await _require_profile(db, current_user)
    # Someone else's lead and a missing one answer the same 404, so ids cannot be probed.
    lead = (await db.execute(select(Lead).where(Lead.id == lead_id, Lead.usta_id == usta.id))).scalar_one_or_none()
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="So'rov topilmadi")
    lead.status = body.status
    await db.flush()
    client = (await db.execute(select(User).where(User.id == lead.user_id))).scalar_one_or_none()
    room = None
    if lead.room_id is not None:
        room = (await db.execute(select(Room).where(Room.id == lead.room_id))).scalar_one_or_none()
    return _lead_out(lead, client, room)
