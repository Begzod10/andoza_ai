"""Router package — each module exposes a ``router`` APIRouter instance."""

from app.routers import (
    auth,
    apartments,
    rooms,
    catalog,
    leads,
    media,
    estimate,
    draft_rooms,
    ai,
    meshy,
    electrical,
    decoration,
    finishes,
    furniture_placements,
    room_state,
)

__all__ = [
    "auth",
    "apartments",
    "rooms",
    "catalog",
    "leads",
    "media",
    "estimate",
    "draft_rooms",
    "ai",
    "meshy",
    "electrical",
    "decoration",
    "finishes",
    "furniture_placements",
    "room_state",
]
