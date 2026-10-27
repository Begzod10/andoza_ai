"""Users report objectionable published content; admins work the queue.

Ustalar, their portfolios, sellers and their products, and uploaded wallpapers
are published by users and shown to everyone, so anyone signed in can flag
one (App Store guideline 1.2). The target is not looked up: ids come from
several tables, and an admin checks the report by hand anyway.
"""
from __future__ import annotations

import uuid as uuid_module
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import AdminUser, CurrentUser, DbSession
from app.core.cache import get_redis
from app.models.content_report import ContentReport
from app.routers.auth import _enforce_rate_limit
from app.schemas.content_report import (
    ReportCreate,
    ReportCreated,
    ReportDecision,
    ReportOut,
    ReportStatus,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])
admin_router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

_REPORT_USER_RATE_LIMIT = 20     # max reports per user per window
_REPORT_USER_RATE_WINDOW = 3600  # 1 hour


@router.post(
    "",
    response_model=ReportCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Report objectionable content",
)
async def create_report(body: ReportCreate, user: CurrentUser, db: DbSession) -> ReportCreated:
    """One report per user and target: reporting the same target again
    answers 201 with the existing report (its id and current status) and
    leaves it unchanged."""
    await _enforce_rate_limit(
        get_redis(),
        f"report_user_rate:{user.id}",
        _REPORT_USER_RATE_LIMIT,
        _REPORT_USER_RATE_WINDOW,
        "Juda ko'p shikoyat yuborildi. Birozdan keyin qayta urinib ko'ring.",
    )

    lookup = select(ContentReport).where(
        ContentReport.reporter_id == user.id,
        ContentReport.target_type == body.target_type,
        ContentReport.target_id == body.target_id,
    )
    report = (await db.execute(lookup)).scalar_one_or_none()
    if report is None:
        details = (body.details or "").strip() or None
        try:
            # Savepoint: a double tap that loses the race on the unique key
            # rolls back only this insert and gets the other request's row.
            async with db.begin_nested():
                report = ContentReport(
                    id=uuid_module.uuid4(),
                    reporter_id=user.id,
                    target_type=body.target_type,
                    target_id=body.target_id,
                    reason=body.reason,
                    details=details,
                    status="open",
                )
                db.add(report)
                await db.flush()
        except IntegrityError:
            report = (await db.execute(lookup)).scalar_one()
        else:
            logger.info(
                "content_reported",
                target_type=body.target_type,
                target_id=body.target_id,
                reason=body.reason,
            )
    return ReportCreated(id=report.id, status=report.status)


@admin_router.get("", response_model=list[ReportOut], summary="Reported content, newest first")
async def list_reports(
    admin: AdminUser,
    db: DbSession,
    status_filter: ReportStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[ReportOut]:
    q = select(ContentReport)
    if status_filter is not None:
        q = q.where(ContentReport.status == status_filter)
    q = q.order_by(ContentReport.created_at.desc()).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return [ReportOut.model_validate(r) for r in rows]


@admin_router.patch("/{report_id}", response_model=ReportOut, summary="Resolve or dismiss a report")
async def decide_report(
    report_id: uuid_module.UUID, body: ReportDecision, admin: AdminUser, db: DbSession
) -> ReportOut:
    report = (
        await db.execute(select(ContentReport).where(ContentReport.id == report_id))
    ).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shikoyat topilmadi")
    report.status = body.status
    report.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("content_report_decided", report_id=str(report.id), status=body.status, admin_id=str(admin.id))
    return ReportOut.model_validate(report)
