"""A phone registers (or drops) its push-notification token."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.device_token import DeviceToken
from app.schemas.device import DeviceRegister, DeviceUnregister

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(body: DeviceRegister, db: DbSession, user: CurrentUser) -> Response:
    """Upsert by token: a re-registration refreshes locale/last_seen_at, and a
    token last seen on another account moves to the caller."""
    row = (await db.execute(select(DeviceToken).where(DeviceToken.token == body.token))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(DeviceToken(user_id=user.id, token=body.token, platform=body.platform, locale=body.locale))
    else:
        row.user_id = user.id
        row.platform = body.platform
        row.locale = body.locale
        row.last_seen_at = now
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(body: DeviceUnregister, db: DbSession, user: CurrentUser) -> Response:
    """Drop the caller's own token. Someone else's token is left alone and the
    answer is the same 204, so this can't be used to probe for tokens."""
    row = (await db.execute(select(DeviceToken).where(DeviceToken.token == body.token))).scalar_one_or_none()
    if row is not None and row.user_id == user.id:
        await db.delete(row)
        await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
