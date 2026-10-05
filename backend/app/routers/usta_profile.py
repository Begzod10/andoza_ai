"""An usta runs one public profile and appears in the catalog once approved.

An usta is a user who owns an ``ustalar`` row (``ustalar.owner_user_id``). Like
the seller router, everything here acts on the caller's own profile — it is
looked up from the caller, never from an id in the request. A new application
starts pending and inactive and reaches the public list only once an admin
approves it (see ``routers/admin_moderation.py``).
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.usta import Usta
from app.routers.admin_catalog import _invalidate_after_commit
from app.schemas.usta_profile import UstaApply, UstaProfileOut, UstaProfileUpdate

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
