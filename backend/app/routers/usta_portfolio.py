"""Photos of an usta's finished work.

The owner manages them under ``/usta/portfolio`` (always the caller's own profile,
found from the caller); anyone can read an approved usta's gallery.
"""
from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url, upload_file
from app.models.usta import Usta
from app.models.usta_portfolio import UstaPortfolioItem
from app.routers.admin_catalog import _delete_files_after_commit
from app.routers.usta_profile import _require_profile
from app.schemas.usta_portfolio import PortfolioItemOut

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/usta/portfolio", tags=["usta"])
public_router = APIRouter(tags=["ustalar"])

_MAX_IMAGE_BYTES = 5 * 1024 * 1024
_MAX_ITEMS = 12
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAGIC = {"image/jpeg": (b"\xff\xd8\xff",), "image/png": (b"\x89PNG",), "image/webp": (b"RIFF",)}


def _out(item: UstaPortfolioItem, request: Request) -> PortfolioItemOut:
    return PortfolioItemOut(
        id=item.id,
        image_url=absolute_media_url(request, item.image_key),
        caption=item.caption,
        created_at=item.created_at,
    )


async def _items(db: DbSession, usta_id: uuid_module.UUID) -> list[UstaPortfolioItem]:
    return list((await db.execute(
        select(UstaPortfolioItem)
        .where(UstaPortfolioItem.usta_id == usta_id)
        .order_by(UstaPortfolioItem.created_at.desc())
    )).scalars().all())


@router.get("", response_model=list[PortfolioItemOut], summary="The caller's own portfolio photos, newest first")
async def list_portfolio(request: Request, current_user: CurrentUser, db: DbSession) -> list[PortfolioItemOut]:
    usta = await _require_profile(db, current_user)
    return [_out(i, request) for i in await _items(db, usta.id)]


@router.post(
    "",
    response_model=PortfolioItemOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a photo of finished work (jpeg/png/webp, up to 5 MB, 12 per usta)",
)
async def add_portfolio_item(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile,
    caption: str | None = Form(default=None, max_length=200),
) -> PortfolioItemOut:
    usta = await _require_profile(db, current_user)

    count = (await db.execute(
        select(func.count()).select_from(UstaPortfolioItem).where(UstaPortfolioItem.usta_id == usta.id)
    )).scalar_one()
    if count >= _MAX_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Portfoliyoda {_MAX_ITEMS} tadan ortiq rasm bo'lishi mumkin emas",
        )

    content_type = file.content_type or ""
    if content_type not in _EXT:
        raise HTTPException(status_code=415, detail="Rasm faqat jpeg/png/webp formatida bo'lishi mumkin")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Bo'sh fayl yuborildi")
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Rasm hajmi {_MAX_IMAGE_BYTES // (1024 * 1024)} MB dan oshmasligi kerak")
    if not data.startswith(_MAGIC[content_type]):
        raise HTTPException(status_code=415, detail="Rasm fayli buzilgan yoki noto'g'ri formatda")

    key = f"usta-portfolio/{uuid_module.uuid4()}.{_EXT[content_type]}"
    try:
        stored = await upload_file(data, key, content_type=content_type)
    except Exception as exc:
        logger.error("usta_portfolio_upload_failed", key=key, error=str(exc))
        raise HTTPException(status_code=502, detail="Rasmni saqlab bo'lmadi") from exc
    image_key = stored if stored.startswith("http") else key

    item = UstaPortfolioItem(usta_id=usta.id, image_key=image_key, caption=(caption or "").strip() or None)
    try:
        db.add(item)
        await db.flush()
        await db.refresh(item)
    except Exception:
        _delete_files_after_commit(db, [image_key], "usta_portfolio_orphan_delete_failed")
        raise
    logger.info("usta_portfolio_added", id=str(item.id), usta_id=str(usta.id))
    return _out(item, request)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove one of the caller's portfolio photos")
async def delete_portfolio_item(item_id: uuid_module.UUID, current_user: CurrentUser, db: DbSession) -> None:
    usta = await _require_profile(db, current_user)
    item = (await db.execute(select(UstaPortfolioItem).where(UstaPortfolioItem.id == item_id))).scalar_one_or_none()
    # Someone else's photo and a missing one answer the same 404.
    if item is None or item.usta_id != usta.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rasm topilmadi")
    key = item.image_key
    await db.delete(item)
    await db.flush()
    _delete_files_after_commit(db, [key], "usta_portfolio_file_delete_failed")


@public_router.get(
    "/ustalar/{usta_id}/portfolio",
    response_model=list[PortfolioItemOut],
    summary="Public gallery of an approved usta",
)
async def public_portfolio(usta_id: uuid_module.UUID, request: Request, db: DbSession) -> list[PortfolioItemOut]:
    usta = (await db.execute(select(Usta).where(Usta.id == usta_id))).scalar_one_or_none()
    if usta is None or usta.status != "approved" or not usta.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usta topilmadi")
    return [_out(i, request) for i in await _items(db, usta.id)]
