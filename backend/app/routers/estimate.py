"""Estimate router — compute/preview/persist smeta + history + PDF download.

Endpoints
---------
POST /rooms/{room_id}/estimate/preview
    Compute a live smeta preview without persisting.

POST /rooms/{room_id}/estimate
    Compute a fresh smeta snapshot and persist it as an Estimate row.

GET  /rooms/{room_id}/estimates?limit=&offset=
    Paginated estimate history for a room (summary rows only).

GET  /estimates/{estimate_id}
    Full estimate response for a single persisted estimate.

GET  /rooms/{room_id}/estimate.pdf
GET  /rooms/{room_id}/estimate/pdf
    Re-run the latest estimate (or load the last persisted one) and
    stream it as a ReportLab-generated PDF. Both path forms are supported —
    ``estimate.pdf`` for direct-download/file-extension semantics and
    ``estimate/pdf`` as a slash-only alias for clients/proxies that mangle
    literal dots in path segments.

Registration
------------
Include both routers in your ``app.api.v1`` module::

    from app.routers.estimate import router as estimate_router
    from app.routers.estimate import estimates_router
    api_router.include_router(estimate_router, tags=["estimate"])
    api_router.include_router(estimates_router, tags=["estimate"])
"""
from __future__ import annotations

import dataclasses
import io
import uuid
from datetime import date, datetime, timezone
from itertools import groupby
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.models.apartment import Apartment
from app.models.estimate import Estimate
from app.models.material import Material
from app.models.norm import Norm
from app.models.room import Room
from app.schemas.estimate import (
    EstimateLine,
    EstimateResponse,
    EstimateSummary,
    PaginatedEstimates,
)
from app.services.smeta import ComputedEstimate, ComputedLine, compute_estimate

router = APIRouter(prefix="/rooms/{room_id}")

# Separate router — /estimates/{estimate_id} is NOT nested under /rooms/{room_id}.
estimates_router = APIRouter(prefix="/estimates")

_DEFAULT_CURRENCY = "UZS"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_room_for_user(
    room_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Any,
) -> Room:
    """Load Room while verifying it belongs to *user_id* via Apartment."""
    result = await db.execute(
        select(Room)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(Room.id == room_id, Apartment.user_id == user_id, Room.deleted == False)
    )
    room = result.scalar_one_or_none()
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    return room


async def _load_materials(
    room: Room,
    db: Any,
) -> dict[str, Material]:
    """Return {str(material_id): Material} for all surfaces on *room*."""
    surfaces: dict = room.surfaces or {}
    raw_ids = [v for v in surfaces.values() if v]
    if not raw_ids:
        return {}
    try:
        mid_uuids = [uuid.UUID(str(mid)) for mid in raw_ids]
    except ValueError:
        return {}
    result = await db.execute(
        select(Material)
        .options(selectinload(Material.store))
        .where(Material.id.in_(mid_uuids))
    )
    return {str(m.id): m for m in result.scalars().all()}


async def _load_norms(db: Any) -> dict[str, Norm]:
    """Return {material_key: Norm} for all relevant norm keys.

    Keys used by the smeta engine (Phase 4):
      "grunt", "shpatlyovka", "oboy", "laminat", "plitka", "plintus",
      "elektr_kabel", "oboy_tekstura", "oboy_yolli", "oboy_damask",
      "oboy_geometrik", "oboy_gul", "oboy_bolalar"

    Loading all rows is intentional — the table is small and new keys are
    picked up automatically without code changes.
    """
    result = await db.execute(select(Norm))
    return {n.material_key: n for n in result.scalars().all()}


def _computed_to_schema_lines(lines: list[ComputedLine]) -> list[EstimateLine]:
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


def _jsonb_lines_to_schema(raw_lines: list[dict]) -> list[EstimateLine]:
    """Convert JSONB-stored ComputedLine dicts back into EstimateLine rows."""
    return [
        EstimateLine(
            label=ln.get("label", ""),
            formula=ln.get("formula", ""),
            quantity=ln.get("qty", 0),
            unit=ln.get("unit", ""),
            unit_price=ln.get("unit_price_uzs", 0),
            total_uzs=ln.get("subtotal_uzs", 0),
            is_approximate=ln.get("is_approximate", False),
            store_id=None,
            category=ln.get("category", ""),
        )
        for ln in raw_lines
    ]


def _lines_to_jsonb(lines: list[ComputedLine]) -> list[dict]:
    """Serialise ComputedLine list to plain dicts for JSONB storage."""
    return [dataclasses.asdict(ln) for ln in lines]


def _has_electrical(raw_lines: list[dict]) -> bool:
    return any(
        ln.get("category") == "elektr" and not ln.get("is_approximate", False)
        for ln in raw_lines
    )


# ---------------------------------------------------------------------------
# POST /rooms/{room_id}/estimate/preview  (live preview, no persistence)
# ---------------------------------------------------------------------------

@router.post(
    "/estimate/preview",
    response_model=EstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute live smeta preview without persisting",
)
async def preview_estimate(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> EstimateResponse:
    """Compute a smeta for the room and return it without creating an Estimate row.

    Intended for real-time UI previews where the user is still configuring their
    design.  The returned ``id`` is a transient UUID and ``created_at`` is the
    current UTC time; neither value is stored in the database.
    """
    room = await _load_room_for_user(room_id, current_user.id, db)
    materials_map = await _load_materials(room, db)
    norms_map = await _load_norms(db)

    computed: ComputedEstimate = compute_estimate(room, materials_map, norms_map)

    return EstimateResponse(
        id=uuid.uuid4(),
        room_id=room.id,
        lines=_computed_to_schema_lines(computed.lines),
        total_uzs=computed.total_uzs,
        total_min=computed.total_min,
        total_max=computed.total_max,
        currency=_DEFAULT_CURRENCY,
        status="draft",
        created_at=datetime.now(timezone.utc),
        has_electrical=computed.has_electrical,
    )


# ---------------------------------------------------------------------------
# POST /rooms/{room_id}/estimate
# ---------------------------------------------------------------------------

@router.post(
    "/estimate",
    response_model=EstimateResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute and persist a smeta snapshot for a room",
)
async def create_estimate(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> EstimateResponse:
    room = await _load_room_for_user(room_id, current_user.id, db)
    materials_map = await _load_materials(room, db)
    norms_map = await _load_norms(db)

    computed: ComputedEstimate = compute_estimate(room, materials_map, norms_map)

    # Persist immutable snapshot
    estimate = Estimate(
        room_id=room.id,
        lines=_lines_to_jsonb(computed.lines),
        total_uzs=computed.total_uzs,
        currency=_DEFAULT_CURRENCY,
        status="final",
    )
    db.add(estimate)
    await db.flush()
    await db.refresh(estimate)

    return EstimateResponse(
        id=estimate.id,
        room_id=room.id,
        lines=_computed_to_schema_lines(computed.lines),
        total_uzs=computed.total_uzs,
        total_min=computed.total_min,
        total_max=computed.total_max,
        currency=estimate.currency,
        status=estimate.status,
        created_at=estimate.created_at,
        has_electrical=computed.has_electrical,
    )


# ---------------------------------------------------------------------------
# GET /rooms/{room_id}/estimates?limit=&offset=  (paginated history)
# ---------------------------------------------------------------------------

@router.get(
    "/estimates",
    response_model=PaginatedEstimates,
    summary="Paginated estimate history for a room, newest first",
)
async def list_estimates(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PaginatedEstimates:
    # Ownership check — 404s if the room doesn't exist or isn't owned by the user.
    await _load_room_for_user(room_id, current_user.id, db)

    count_result = await db.execute(
        select(func.count()).select_from(Estimate).where(Estimate.room_id == room_id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Estimate)
        .where(Estimate.room_id == room_id)
        .order_by(Estimate.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    estimates = result.scalars().all()

    return PaginatedEstimates(
        items=[EstimateSummary.model_validate(e) for e in estimates],
        total=total,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# GET /rooms/{room_id}/estimate.pdf  +  GET /rooms/{room_id}/estimate/pdf
# ---------------------------------------------------------------------------

async def _generate_estimate_pdf(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    room = await _load_room_for_user(room_id, current_user.id, db)
    materials_map = await _load_materials(room, db)
    norms_map = await _load_norms(db)

    computed: ComputedEstimate = compute_estimate(room, materials_map, norms_map)

    pdf_bytes = _build_pdf(room, computed)

    filename = f"smeta_{room.name.replace(' ', '_')}_{date.today()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/estimate.pdf",
    response_class=StreamingResponse,
    summary="Download the latest smeta as a ReportLab PDF",
)
async def get_estimate_pdf(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    return await _generate_estimate_pdf(room_id, current_user, db)


@router.get(
    "/estimate/pdf",
    response_class=StreamingResponse,
    summary="Download the latest smeta as a ReportLab PDF (slash-path alias)",
)
async def get_estimate_pdf_alias(
    room_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    return await _generate_estimate_pdf(room_id, current_user, db)


# ---------------------------------------------------------------------------
# GET /estimates/{estimate_id}  (full estimate response, not room-scoped)
# ---------------------------------------------------------------------------

@estimates_router.get(
    "/{estimate_id}",
    response_model=EstimateResponse,
    summary="Get a single persisted estimate by id",
)
async def get_estimate(
    estimate_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> EstimateResponse:
    result = await db.execute(
        select(Estimate)
        .join(Room, Estimate.room_id == Room.id)
        .join(Apartment, Room.apartment_id == Apartment.id)
        .where(
            Estimate.id == estimate_id,
            Apartment.user_id == current_user.id,
            Room.deleted == False,
        )
    )
    estimate = result.scalar_one_or_none()
    if estimate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estimate not found")

    raw_lines: list[dict] = estimate.lines or []
    total_uzs = estimate.total_uzs

    return EstimateResponse(
        id=estimate.id,
        room_id=estimate.room_id,
        lines=_jsonb_lines_to_schema(raw_lines),
        total_uzs=total_uzs,
        total_min=int(total_uzs * 0.9),
        total_max=int(total_uzs * 1.1),
        currency=estimate.currency,
        status=estimate.status,
        created_at=estimate.created_at,
        has_electrical=_has_electrical(raw_lines),
    )


# ---------------------------------------------------------------------------
# PDF generation (ReportLab)
# ---------------------------------------------------------------------------

_BRAND_BLUE = colors.HexColor("#1E88E5")
_AMBER = colors.HexColor("#FB8C00")
_LIGHT_GREY = colors.HexColor("#F5F5F5")
_MID_GREY = colors.HexColor("#9E9E9E")


def _build_pdf(room: Room, est: ComputedEstimate) -> bytes:
    """Render *est* as a PDF and return raw bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title=f"UyTa'mir Smeta — {room.name}",
        author="UyTa'mir",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "SmH1",
        parent=styles["Title"],
        fontSize=18,
        textColor=_BRAND_BLUE,
        spaceAfter=4,
    )
    h2 = ParagraphStyle(
        "SmH2",
        parent=styles["Heading2"],
        fontSize=11,
        textColor=_BRAND_BLUE,
        spaceBefore=10,
        spaceAfter=4,
    )
    normal = styles["Normal"]
    small = ParagraphStyle(
        "SmSmall",
        parent=normal,
        fontSize=8,
        textColor=_MID_GREY,
    )
    warning_style = ParagraphStyle(
        "SmWarning",
        parent=normal,
        fontSize=8,
        textColor=_AMBER,
    )
    disclaimer = ParagraphStyle(
        "SmDisclaimer",
        parent=normal,
        fontSize=9,
        textColor=_MID_GREY,
        spaceBefore=6,
    )

    story: list[Any] = []

    # ---- Header -------------------------------------------------------
    story.append(Paragraph("UyTa'mir — Smeta", h1))
    story.append(Paragraph(
        f"Xona: <b>{room.name}</b> &nbsp;|&nbsp; Sana: {date.today():%d.%m.%Y}",
        normal,
    ))
    story.append(Spacer(1, 0.4 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_BLUE))
    story.append(Spacer(1, 0.3 * cm))

    # ---- Lines grouped by store ---------------------------------------
    col_widths = [5.5 * cm, 5.5 * cm, 1.5 * cm, 1.3 * cm, 2.5 * cm, 2.5 * cm]

    def _header_row() -> list[str]:
        return ["Material / Xizmat", "Formula", "Miqdor", "Birlik",
                "Narx (UZS)", "Jami (UZS)"]

    def _fmt_num(n: int | float) -> str:
        return f"{int(n):,}".replace(",", " ")

    def _line_row(ln: ComputedLine) -> list[Any]:
        prefix = "≈ " if ln.is_approximate else ""
        return [
            Paragraph(ln.label, normal),
            Paragraph(f"<font size='7'>{ln.formula}</font>", normal),
            _fmt_num(ln.qty),
            ln.unit,
            _fmt_num(ln.unit_price_uzs),
            prefix + _fmt_num(ln.subtotal_uzs),
        ]

    def _table_style(nrows: int) -> TableStyle:
        return TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT_GREY]),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.25, _MID_GREY),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])

    # Group by store (None store goes to "Boshqa")
    def _store_key(ln: ComputedLine) -> str:
        return ln.store_name or "Boshqa / Umumiy"

    sorted_lines = sorted(est.lines, key=_store_key)

    for store_name, group in groupby(sorted_lines, key=_store_key):
        group_list = list(group)
        story.append(Paragraph(f"Do'kon: {store_name}", h2))

        table_data: list[list[Any]] = [_header_row()]
        for ln in group_list:
            table_data.append(_line_row(ln))
            if ln.warning:
                table_data.append([
                    Paragraph(
                        f"⚠ {ln.warning}",
                        warning_style,
                    ),
                    "", "", "", "", "",
                ])

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(_table_style(len(table_data)))
        story.append(tbl)
        story.append(Spacer(1, 0.3 * cm))

    # ---- Footer / totals ----------------------------------------------
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_BLUE))
    story.append(Spacer(1, 0.2 * cm))

    total_data = [
        ["Taxminiy xarajat (aniq materiallar):",
         f"{_fmt_num(est.total_uzs)} UZS"],
        ["Minimal variant (−10%):",
         f"{_fmt_num(est.total_min)} UZS"],
        ["Maksimal variant (+10%):",
         f"{_fmt_num(est.total_max)} UZS"],
    ]
    total_tbl = Table(
        total_data,
        colWidths=[10 * cm, 5 * cm],
    )
    total_tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TEXTCOLOR", (0, 0), (-1, 0), _BRAND_BLUE),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(total_tbl)
    story.append(Spacer(1, 0.3 * cm))

    disclaimer_text = (
        "Bu taxminiy hisob. Yakuniy narx material tanlovi, bozor o'zgarishi "
        "va ishchi haqiga qarab farq qilishi mumkin. "
        "Taxminiy elektr xarajatlari umumiy summaga kiritilmagan."
    )
    story.append(Paragraph(disclaimer_text, disclaimer))

    if est.has_electrical:
        story.append(Paragraph(
            "⚠  Elektr ishlari narxi taxminiy — elektrik ustasi bilan tasdiqlang.",
            warning_style,
        ))

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        f"Tuzilgan: UyTa'mir &nbsp;|&nbsp; {datetime.now(tz=timezone.utc):%d.%m.%Y %H:%M} UTC",
        small,
    ))

    doc.build(story)
    return buf.getvalue()
