"""Currency service — live USD/UZS exchange rate.

Source: the Central Bank of Uzbekistan's public rate API (no auth, published
once daily). Rates are cached in-process so a spike in smeta requests never
turns into a spike in outbound CBU requests.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
import structlog

logger = structlog.get_logger(__name__)

CBU_USD_RATE_URL = "https://cbu.uz/en/arkhiv-kursov-valyut/json/USD/"
CACHE_TTL_SECONDS = 3600  # CBU publishes once a day — hourly refresh is plenty
FALLBACK_USD_RATE = 12_700.0  # so'm per 1 USD, used only if CBU is unreachable
# and nothing has ever been fetched successfully in this process.


@dataclass
class _Cache:
    rate: float | None = None
    fetched_at: float = 0.0


_cache = _Cache()


async def get_usd_rate() -> float:
    """Return so'm-per-1-USD: from cache when fresh, else refetched from CBU.

    Never raises. A fetch failure logs a warning and falls back to the last
    known-good rate (or FALLBACK_USD_RATE if none was ever fetched) — a
    currency-API hiccup must never break the smeta page.
    """
    now = time.monotonic()
    if _cache.rate is not None and (now - _cache.fetched_at) < CACHE_TTL_SECONDS:
        return _cache.rate

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(CBU_USD_RATE_URL)
            resp.raise_for_status()
            data = resp.json()
        rate = float(data[0]["Rate"])
        _cache.rate = rate
        _cache.fetched_at = now
        return rate
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as e:
        logger.warning("currency.usd_rate_fetch_failed", error=str(e))
        return _cache.rate if _cache.rate is not None else FALLBACK_USD_RATE


def uzs_to_usd(uzs: int, usd_rate: float) -> float:
    """Convert a so'm amount to USD at *usd_rate* so'm-per-dollar."""
    if usd_rate <= 0:
        return 0.0
    return uzs / usd_rate
