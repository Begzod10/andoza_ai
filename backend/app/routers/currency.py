"""Currency router — exposes the live USD/UZS rate the smeta engine uses.

GET /currency/usd-rate
    Current so'm-per-1-USD rate (cached, see app.services.currency).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.currency import get_usd_rate

router = APIRouter(prefix="/currency")


class UsdRateResponse(BaseModel):
    usd_rate: float
    date: str


@router.get("/usd-rate", response_model=UsdRateResponse, summary="Live USD/UZS rate")
async def usd_rate() -> UsdRateResponse:
    rate = await get_usd_rate()
    return UsdRateResponse(usd_rate=rate, date=date.today().isoformat())
