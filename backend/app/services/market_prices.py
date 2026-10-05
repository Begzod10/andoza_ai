"""Real shop prices for an estimate's materials, found with Gemini + Google Search.

The estimate prices every line from the catalog (or, failing that, an AI builder's
ballpark — see smeta_ai.py). This module is the optional step after that: ask the
web what a shop in Uzbekistan charges today, and where, and put that price on the
line with its source.

What it must never do is turn a model's guess into a number that looks measured, so:
  * the model only *finds* a unit price; quantities and totals stay in code;
  * a price with no shop page behind it is dropped;
  * a price wildly off the catalog's is dropped (probably another product);
  * every failure (feature off, no key, quota, timeout, unreadable answer) leaves
    the line exactly as it was. The estimate never breaks over this.

Search grounding is not available on Google's free tier, so the feature stays off
until MARKET_PRICES_ENABLED is set with a billing-enabled GEMINI_API_KEY.
"""
from __future__ import annotations

import asyncio
import dataclasses
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from typing import Awaitable, Callable

import httpx
import structlog

from app.config import settings
from app.core.cache import cache_get, cache_set
from app.services.llm import check_and_increment_budget_for
from app.services.smeta import ComputedEstimate, ComputedLine, recompute_totals

log = structlog.get_logger(__name__)

# Lines worth looking up: a material a shop sells at a shelf price. Electrics and
# furniture are composites (a point, a sofa) with no single comparable price, and
# a texture wall is already priced by smeta_ai.
SEARCHABLE_CATEGORIES = frozenset(
    {"suvoq", "grunt", "shpatlyovka", "boyoq", "oboy", "laminat", "plitka", "plintus", "shift"}
)

_CONCURRENCY = 4
_MISS_TTL = 24 * 3600  # remember "nothing found" for a day, so a miss is not re-billed per click

_PROMPT = """Siz O'zbekistondagi qurilish materiallari narxlarini tekshiruvchisiz.
Google qidiruvidan foydalanib, quyidagi mahsulotning HOZIRGI chakana narxini O'zbekiston so'mida toping.

Mahsulot: {name}
Narx qaysi birlik uchun: {unit}

Qoidalar:
- Faqat O'zbekistondagi do'kon yoki e'lon saytlaridagi (masalan olx.uz, uzum.uz, do'kon saytlari) haqiqiy narxni oling.
- Narxni o'zingiz taxmin qilmang va eslab qolgan narxni yozmang. Topolmasangiz price_uzs ni null qiling.
- Narx aynan shu birlik uchun bo'lsin (masalan qop uchun, m2 uchun), boshqa o'lchamdagi qadoq narxini bermang.
Javobni FAQAT shu JSON ko'rinishida bering, boshqa matnsiz:
{{"price_uzs": son yoki null, "store": "do'kon nomi", "url": "narx turgan sahifa havolasi", "found_on": "sahifa sarlavhasi"}}"""


@dataclass(frozen=True)
class MarketQuote:
    price_uzs: int
    store: str
    url: str
    checked_at: str  # ISO date


Searcher = Callable[[str, str], Awaitable["MarketQuote | None"]]


def market_prices_available() -> bool:
    return bool(settings.MARKET_PRICES_ENABLED and settings.GEMINI_API_KEY)


def _parse_quote(text: str) -> MarketQuote | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
        price = int(round(float(data["price_uzs"])))
        store = str(data.get("store") or "").strip()
        url = str(data.get("url") or "").strip()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    if price <= 0 or not store or not url.lower().startswith(("http://", "https://")):
        return None
    return MarketQuote(price_uzs=price, store=store[:120], url=url[:500], checked_at=date.today().isoformat())


async def gemini_search_quote(name: str, unit: str) -> MarketQuote | None:
    """One Gemini + Google Search call for one material. None on any failure."""
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
                headers={"x-goog-api-key": settings.GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": _PROMPT.format(name=name, unit=unit)}]}],
                    "tools": [{"google_search": {}}],
                    "generationConfig": {"temperature": 0},
                },
            )
        if resp.status_code != 200:
            log.warning("market_prices.http_error", name=name, status=resp.status_code)
            return None
        cand = (resp.json().get("candidates") or [{}])[0]
        text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
        return _parse_quote(text)
    except Exception as exc:  # network, timeout, bad JSON: never break the estimate
        log.warning("market_prices.search_failed", name=name, error=str(exc))
        return None


def _cache_key(name: str, unit: str) -> str:
    return "market_price:" + hashlib.sha256(f"{name}|{unit}".encode()).hexdigest()[:24]


async def _lookup(name: str, unit: str, searcher: Searcher) -> MarketQuote | None:
    key = _cache_key(name, unit)
    try:
        cached = await cache_get(key)
    except Exception:
        cached = None
    if isinstance(cached, dict):
        return None if cached.get("miss") else MarketQuote(**cached)

    quote = await searcher(name, unit)
    try:
        if quote is None:
            await cache_set(key, {"miss": True}, ttl=_MISS_TTL)
        else:
            await cache_set(key, dataclasses.asdict(quote), ttl=settings.MARKET_PRICE_CACHE_DAYS * 86400)
    except Exception:
        pass
    return quote


def plausible(quote: MarketQuote, reference_uzs: int) -> bool:
    """A found price is only trusted if it is close enough to the catalog's to be
    the same product. With no catalog price to compare to, any positive one passes."""
    if quote.price_uzs <= 0:
        return False
    if reference_uzs <= 0:
        return True
    ratio = settings.MARKET_PRICE_MAX_DEVIATION
    return reference_uzs / ratio <= quote.price_uzs <= reference_uzs * ratio


def _reprice(ln: ComputedLine, quote: MarketQuote) -> ComputedLine:
    subtotal = round(ln.qty * quote.price_uzs * 100) // 100
    return dataclasses.replace(
        ln,
        unit_price_uzs=quote.price_uzs,
        subtotal_uzs=subtotal,
        store_name=quote.store,
        is_approximate=False,
        warning=None,
        price_source="market",
        source_url=quote.url,
        price_checked_at=quote.checked_at,
    )


async def apply_market_prices(
    est: ComputedEstimate,
    *,
    user_id: str,
    searcher: Searcher | None = None,
) -> tuple[ComputedEstimate, int, int]:
    """Reprice the searchable lines with real shop prices.

    Returns (estimate, lines_checked, lines_updated). Raises BudgetExceededError when
    the user is out of refreshes for the day; every other failure just leaves the
    affected line as it was. Never mutates *est*.
    """
    searcher = searcher or gemini_search_quote
    todo = [
        i for i, ln in enumerate(est.lines)
        if ln.category in SEARCHABLE_CATEGORIES and ln.qty > 0 and ln.price_source is None
    ][: settings.MARKET_PRICE_MAX_LINES]
    if not todo:
        return est, 0, 0

    await check_and_increment_budget_for(user_id, "market_prices", settings.MARKET_PRICES_DAILY_LIMIT)

    sem = asyncio.Semaphore(_CONCURRENCY)

    async def one(i: int) -> tuple[int, MarketQuote | None]:
        async with sem:
            ln = est.lines[i]
            try:
                return i, await _lookup(ln.label, ln.unit, searcher)
            except Exception as exc:
                log.warning("market_prices.lookup_failed", name=ln.label, error=str(exc))
                return i, None

    found = dict(await asyncio.gather(*(one(i) for i in todo)))

    lines = list(est.lines)
    updated = 0
    for i, quote in found.items():
        if quote is not None and plausible(quote, lines[i].unit_price_uzs):
            lines[i] = _reprice(lines[i], quote)
            updated += 1
    if updated == 0:
        return est, len(todo), 0
    return recompute_totals(lines), len(todo), updated
