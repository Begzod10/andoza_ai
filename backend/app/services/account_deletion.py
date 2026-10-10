"""Permanent self-service account deletion (store policy requirement).

Order matters:
  1. collect every stored-file key while the rows still exist,
  2. delete the shop and the usta profile explicitly — their owner FK is
     SET NULL, which would leave a phone/name publicly listed,
  3. delete the user row (DB ON DELETE CASCADE removes apartments, rooms,
     models, renders, orders, leads, inquiries),
  4. schedule file removal and cache invalidation for AFTER the commit, so a
     failed commit never leaves live rows pointing at deleted files. Storage
     failures are logged, never raised.

Shared wallpapers the user uploaded stay in the library (uploaded_by -> NULL).
"""
from __future__ import annotations

import functools

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.model_files import model_keys
from app.core.cache import get_redis
from app.database import run_after_commit
from app.models.apartment import Apartment
from app.models.room import Room
from app.models.room_render import RoomRender
from app.models.store import Store
from app.models.user import User
from app.models.user_model import UserModel
from app.models.usta import Usta
from app.models.usta_portfolio import UstaPortfolioItem
from app.routers.admin_catalog import _delete_files_after_commit, _invalidate_after_commit

logger = structlog.get_logger(__name__)


def _scan_keys(scan: dict | None) -> list[str]:
    if not isinstance(scan, dict):
        return []
    keys = [scan.get("usdz_path"), scan.get("glb_path")]
    for obj in scan.get("objects") or []:
        if isinstance(obj, dict):
            keys += [obj.get("usdz_path"), obj.get("glb_path")]
    return [k for k in keys if isinstance(k, str) and k]


async def _clear_otp_state(phone: str) -> None:
    try:
        redis = get_redis()
        await redis.delete(f"otp:{phone}", f"otp_attempts:{phone}")
    except Exception as exc:  # best-effort
        logger.warning("account_deletion_otp_cleanup_failed", error=str(exc))


async def delete_account(db: AsyncSession, user: User) -> None:
    user_id = user.id
    phone = user.phone
    keys: list[str | None] = []
    cache_prefixes: list[str] = []

    # Shops (and their models / wallpapers) the user owns.
    stores = (
        await db.execute(
            select(Store)
            .options(selectinload(Store.furniture_items), selectinload(Store.wallpapers))
            .where(Store.owner_user_id == user_id)
        )
    ).scalars().all()
    for store in stores:
        for item in store.furniture_items:
            keys += [*model_keys(item.glb_key, item.glb_opt_key), item.thumbnail_key]
        keys += [w.storage_key for w in store.wallpapers]
    if stores:
        cache_prefixes += ["stores:", "furniture:"]

    # Craftsman profiles the user owns (+ their portfolio images).
    ustalar = (await db.execute(select(Usta).where(Usta.owner_user_id == user_id))).scalars().all()
    if ustalar:
        portfolio = (
            await db.execute(
                select(UstaPortfolioItem.image_key).where(UstaPortfolioItem.usta_id.in_([u.id for u in ustalar]))
            )
        ).scalars().all()
        keys += list(portfolio)
        cache_prefixes.append("ustalar:")

    # Rooms: thumbnails + LiDAR scan files.
    rooms = (
        await db.execute(
            select(Room.thumbnail_key, Room.room_scan)
            .join(Apartment, Room.apartment_id == Apartment.id)
            .where(Apartment.user_id == user_id)
        )
    ).all()
    for thumbnail_key, scan in rooms:
        keys.append(thumbnail_key)
        keys += _scan_keys(scan)

    renders = (
        await db.execute(select(RoomRender.key, RoomRender.parent_key).where(RoomRender.user_id == user_id))
    ).all()
    for key, parent_key in renders:
        keys += [key, parent_key]

    models = (
        await db.execute(select(UserModel.storage_key, UserModel.opt_key, UserModel.thumb_key).where(UserModel.user_id == user_id))
    ).all()
    for storage_key, opt_key, thumb_key in models:
        keys += [*model_keys(storage_key, opt_key), thumb_key]

    for store in stores:
        await db.delete(store)
    for usta in ustalar:
        await db.delete(usta)
    await db.flush()

    # Core DELETE: the DB cascades do the rest. (ORM delete would try to lazy-load
    # the apartments/leads collections, which an async session cannot do.)
    await db.execute(delete(User).where(User.id == user_id))
    await db.flush()

    for prefix in cache_prefixes:
        _invalidate_after_commit(db, prefix)
    # parent_key can point at another render's key; dedupe, keep order.
    unique_keys = list(dict.fromkeys(k for k in keys if k))
    _delete_files_after_commit(db, unique_keys, "account_delete_file_failed")
    if phone:
        run_after_commit(db, functools.partial(_clear_otp_state, phone))

    logger.info("account_deleted", user_id=str(user_id), files=len(unique_keys))
