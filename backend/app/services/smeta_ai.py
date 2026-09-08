"""AI-backed price estimation for smeta gaps compute_estimate cannot price
deterministically — currently just the "texture" wall covering (a custom
user-uploaded photo wallpaper, which isn't a do'kon catalog Material and so
has no real price anywhere in the database).

Framed as an experienced local builder's ballpark, not a real quote — every
line this fills stays flagged approximate, same as every other approximate
line in the engine.

Kept entirely separate from smeta.py: compute_estimate must stay a pure,
synchronous, deterministic function (see its own module docstring) — this
module is the async, I/O-doing, occasionally-wrong counterpart the router
calls as a best-effort enrichment pass *after* compute_estimate returns.
A failure here (AI features disabled, budget exhausted, an unparseable
response) must never break the estimate — the caller always gets back
either a real price or a clean `None` to leave the line as-is.
"""
from __future__ import annotations

import hashlib
import json

import structlog

from app.config import settings
from app.core.cache import cache_get, cache_set
from app.services.llm import call_llm
from app.services.smeta import ComputedEstimate, ComputedLine, recompute_totals

log = structlog.get_logger(__name__)

# A week — the same gap (the same uploaded photo, the same wall area
# bucket) recurs across every recompute while the user keeps designing the
# room, and a builder's ballpark for "custom photo wallpaper, ~11 m²" isn't
# going to meaningfully change day to day.
_CACHE_TTL = 7 * 24 * 3600

_SYSTEM_PROMPT = (
    "Siz Toshkentda 15 yildan ortiq ishlagan tajribali ta'mirchi-quruvchisiz. "
    "Sizga ish yoki material tavsifi beriladi, va siz shu narsa uchun "
    "2025-yil Toshkent bozori narxlariga asoslanib, so'mda taxminiy narx "
    "aytasiz — na sun'iy past, na shishirilgan, haqiqiy bozordagidek. "
    "Faqat quyidagi JSON formatida javob bering, boshqa hech qanday matn "
    "yozmang:\n"
    '{"narx_som": <butun son>, "izoh": "<bitta qisqa jumla>"}'
)


def _cache_key(description: str, unit: str) -> str:
    digest = hashlib.sha256(f"{description}|{unit}".encode()).hexdigest()[:24]
    return f"ai_price:{digest}"


async def estimate_builder_price(
    description: str,
    unit: str,
    *,
    user_id: str | None = None,
) -> tuple[int, str] | None:
    """Ask the LLM (prompted as an experienced local builder) for a
    realistic UZS price for *description*, priced per *unit*.

    Returns ``(price_uzs, note)`` on success, or ``None`` on any failure —
    AI features disabled, exhausted daily budget, a network error, a
    response that doesn't parse as the expected JSON. Callers must treat
    ``None`` as "leave the line's existing approximate/zero price alone",
    never as something to raise over.
    """
    cache_key = _cache_key(description, unit)
    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and "price_uzs" in cached:
        return cached["price_uzs"], cached.get("note", "")

    try:
        response = await call_llm(
            model=settings.AI_MODEL_EXPLAINER,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"{description} ({unit} uchun narx)"}],
            max_tokens=200,
            user_id=user_id,
            model_type="explainer",
        )
    except Exception as exc:
        # BudgetExceededError, "AI features disabled", a network error — none
        # of these should ever turn into a broken estimate over a nice-to-have.
        log.warning("smeta_ai.call_failed", description=description, error=str(exc))
        return None

    text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    price, note = _parse_price_response(text)
    if price is None or price <= 0:
        log.warning("smeta_ai.unparseable_response", description=description, raw=text)
        return None

    await cache_set(cache_key, {"price_uzs": price, "note": note}, ttl=_CACHE_TTL)
    return price, note


def _parse_price_response(text: str) -> tuple[int | None, str]:
    # The prompt asks for bare JSON, but strip a markdown fence in case the
    # model wraps it anyway — cheap insurance against a near-miss format.
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        data = json.loads(cleaned)
        price = int(data["narx_som"])
        note = str(data.get("izoh", ""))
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        return None, ""
    return price, note


async def fill_ai_price_gaps(
    est: ComputedEstimate,
    *,
    user_id: str | None = None,
) -> ComputedEstimate:
    """Best-effort enrichment pass: for every line compute_estimate flagged
    ``needs_ai_price``, ask for a realistic price and backfill it — leaving
    the line exactly as compute_estimate produced it (0, approximate, its
    own explanatory warning) for any that still can't be priced. Returns a
    fresh ComputedEstimate with totals recomputed from the (possibly
    updated) lines — never mutates *est* in place.
    """
    if not any(ln.needs_ai_price for ln in est.lines):
        return est

    new_lines: list[ComputedLine] = []
    for ln in est.lines:
        if not ln.needs_ai_price or not ln.ai_price_context:
            new_lines.append(ln)
            continue

        result = await estimate_builder_price(ln.ai_price_context, ln.unit, user_id=user_id)
        if result is None:
            new_lines.append(ln)
            continue

        price_uzs, note = result
        price_tiyin = round(price_uzs * 100)
        subtotal_uzs = round(ln.qty * price_tiyin) // 100
        new_lines.append(
            ComputedLine(
                label=ln.label,
                formula=ln.formula,
                qty=ln.qty,
                unit=ln.unit,
                unit_price_uzs=price_uzs,
                subtotal_uzs=subtotal_uzs,
                category=ln.category,
                material_id=ln.material_id,
                store_name=ln.store_name,
                is_approximate=True,
                warning=f"AI taxminiy narx (tajribali usta bahosi): {note}".strip(": "),
                needs_ai_price=False,
                ai_price_context=None,
            )
        )

    return recompute_totals(new_lines)
