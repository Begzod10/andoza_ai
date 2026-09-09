"""Public read-only room sharing ("Ulashish" / Share).

Endpoints
---------
POST   /rooms/{room_id}/share    (auth, owner-only) create or return the
                                  room's public share token -- idempotent.
DELETE /rooms/{room_id}/share    (auth, owner-only) revoke the room's share
                                  link by clearing the token.
GET    /public/rooms/{token}     (NO auth) read-only room view for a valid,
                                  still-active token.

Security notes
---------------
- The token is 24 bytes of ``secrets.token_urlsafe`` randomness (~192 bits
  of entropy) -- never derived from the room id, never sequential. It is
  stored in a column with a UNIQUE index, so two rooms can never collide on
  one, and the public lookup is a single indexed equality match.
- The public lookup treats "wrong token", "revoked token" and "token that
  never existed" identically: all three produce the exact same 404 with the
  exact same body, so revoking a link never leaks that it USED to work.
- The response schema (``PublicRoomOut``) is a hand-picked allowlist -- no
  room id, no apartment_id, no owner/user reference -- so a leaked link can
  never be used to enumerate or pivot into any other room or account.
- The public endpoint is IP rate-limited using the same
  get-check-incr-expire helper ``auth.py`` already uses for OTP/login --
  this project has no general-purpose rate-limit dependency/middleware, so
  rather than invent a second one for a single route, this reuses that
  exact helper.

Registration
------------
    from app.routers.room_share import router as room_share_router
    from app.routers.room_share import public_router as public_room_router
    app.include_router(room_share_router, prefix="/api/v1", tags=["room-share"])
    app.include_router(public_room_router, prefix="/api/v1", tags=["room-share"])
"""
from __future__ import annotations

import secrets
import uuid

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.cache import get_redis
from app.models.room import Room
from app.routers.auth import _enforce_rate_limit, _get_client_ip
from app.schemas.room_share import PublicRoomOut, ShareLinkOut
from app.services.room_access import get_owned_room

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/rooms/{room_id}")
public_router = APIRouter(prefix="/public/rooms")

# 24 random bytes -> ~32 url-safe base64 chars, ~192 bits of entropy -- never
# derived from the room's own id, never sequential.
_TOKEN_BYTES = 24

# A collision is astronomically unlikely (the unique index is the real
# guarantee either way), but retry a handful of times rather than let one
# bad draw bubble up as a 500 IntegrityError.
_MAX_TOKEN_ATTEMPTS = 5

# Keys copied out of Room.state for the public response. An allowlist, not
# a blocklist, so a future field added to `state` (e.g. something tied to
# the apartment layout) stays private by default instead of leaking the
# moment someone adds it.
_PUBLIC_STATE_KEYS = {"designState", "furniture", "electricals", "lights"}

# Public endpoint abuse resistance: this project has no shared rate-limit
# dependency/middleware (only auth.py's inline per-route helper), so this
# reuses that exact pattern rather than adding a new mechanism. Generous
# enough for a real viewer reloading the page a few times, tight enough to
# blunt a script trying to guess tokens.
_PUBLIC_ROOM_IP_LIMIT = 60
_PUBLIC_ROOM_IP_WINDOW = 60  # seconds


def _public_state(state: dict | None) -> dict | None:
    """Trim a room's full `state` JSONB down to the design-relevant,
    read-only-safe subset a public viewer needs (designState/furniture/
    electricals/lights) -- never layoutPos or anything else that might be
    added later without being explicitly allowlisted here."""
    if not state:
        return None
    trimmed = {k: v for k, v in state.items() if k in _PUBLIC_STATE_KEYS}
    return trimmed or None


async def _generate_unique_token(db: DbSession) -> str:
    for _ in range(_MAX_TOKEN_ATTEMPTS):
        candidate = secrets.token_urlsafe(_TOKEN_BYTES)
        existing = await db.execute(select(Room.id).where(Room.share_token == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
    # Never actually reached in practice at 192 bits of entropy.
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Ulashish havolasini yaratib bo'lmadi",
    )


# ---------------------------------------------------------------------------
# POST /rooms/{room_id}/share  (owner-only, idempotent)
# ---------------------------------------------------------------------------

@router.post(
    "/share",
    response_model=ShareLinkOut,
    status_code=status.HTTP_200_OK,
    summary="Create (or return the existing) public share link for a room",
)
async def create_share_link(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ShareLinkOut:
    room = await get_owned_room(room_id, current_user.id, db)
    if not room.share_token:
        room.share_token = await _generate_unique_token(db)
        await db.flush()
        await db.refresh(room)
        logger.info("room_share_link_created", room_id=str(room_id))
    return ShareLinkOut(share_token=room.share_token)


# ---------------------------------------------------------------------------
# DELETE /rooms/{room_id}/share  (owner-only)
# ---------------------------------------------------------------------------

@router.delete(
    "/share",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a room's public share link",
)
async def revoke_share_link(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    room = await get_owned_room(room_id, current_user.id, db)
    room.share_token = None
    await db.flush()
    logger.info("room_share_link_revoked", room_id=str(room_id))


# ---------------------------------------------------------------------------
# GET /public/rooms/{token}  (NO auth)
# ---------------------------------------------------------------------------

@public_router.get(
    "/{token}",
    response_model=PublicRoomOut,
    summary="Public, read-only room view by share token -- no authentication",
)
async def get_public_room(
    token: str,
    request: Request,
    db: DbSession,
) -> PublicRoomOut:
    redis = get_redis()
    client_ip = _get_client_ip(request)
    await _enforce_rate_limit(
        redis,
        f"public_room_ip:{client_ip}",
        _PUBLIC_ROOM_IP_LIMIT,
        _PUBLIC_ROOM_IP_WINDOW,
        "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring.",
    )

    # An empty path segment can never legitimately match (the column is
    # only ever NULL or a real generated token) -- short-circuit rather
    # than let a blank string reach the query. Behaves identically to a
    # not-found token either way; this is just cheaper.
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Havola topilmadi")

    result = await db.execute(
        select(Room).where(Room.share_token == token, Room.deleted == False)
    )
    room = result.scalar_one_or_none()
    if room is None:
        # Same 404 for "never existed", "wrong guess" and "revoked" -- a
        # revoked link must not read any differently from one that was
        # never valid.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Havola topilmadi")

    return PublicRoomOut(
        name=room.name,
        ceiling_h=float(room.ceiling_h) if room.ceiling_h is not None else None,
        geometry=room.geometry,
        surfaces=room.surfaces,
        state=_public_state(room.state),
    )
