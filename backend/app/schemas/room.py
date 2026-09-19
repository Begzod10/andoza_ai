from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID
import uuid

from pydantic import BaseModel, Field, model_validator


class WallElement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique opening identifier")
    type: Literal["eshik", "deraza", "balkon"]
    width: float = Field(ge=0.3, le=5.0)
    height: float = Field(ge=0.3, le=3.5)
    sill_height: float = Field(default=0.0, ge=0.0, le=2.5)
    # Where the opening's CENTRE sits along the wall, as a 0..1 fraction of the
    # wall's length, measured from `vertices[i]` toward `vertices[i + 1]` —
    # i.e. from `walls[i]`'s own start corner (see RoomGeometry.vertices below).
    # 0.0 = centred on the start corner, 0.5 = centred on the wall, 1.0 = on the
    # end corner.
    #
    # CENTRE, not left edge. Both ends of the wire have to agree on this or a
    # 900 mm door lands 450 mm from where it was measured, so, explicitly:
    #   * `room_scan_converter.convert_captured_room` writes the scanned
    #     surface's centre;
    #   * `room_electrical_auto` reads `position * length` back as a centre when
    #     it keeps sockets out of doorways;
    #   * the studio store (`frontend/src/store/roomStore.ts`) keeps its own
    #     millimetre `position` as the opening's LEFT EDGE and converts at the
    #     API boundary (`apiPositionToStoreMm` / `storeElementToApiPosition` in
    #     `frontend/src/lib/wallPositions.ts`) — a store value is never a
    #     `WallElement.position` and vice versa;
    #   * the Flutter mirror (`lib/features/room_scan/room_scan_converter.dart`)
    #     writes the centre too.
    #
    # Centre rather than left edge because it stays meaningful at the ends of
    # the range: an opening straddling a corner, or one wider than its wall,
    # still has exactly one centre, whereas the valid left-edge fractions shrink
    # to [0, 1 - width/length] and empty out entirely once the opening is wider
    # than the wall — a stored 1.0 would then mean "wholly off the wall".
    position: float = Field(default=0.5, ge=0.0, le=1.0)
    # Window type picked in the studio (see frontend windowStyles catalog).
    # Free-form on purpose: the catalog grows in the client, and an unknown id
    # simply falls back to the default sash layout there.
    style_id: str | None = Field(default=None, max_length=40)
    # Casement leaves for a window without an explicit style.
    sashes: int | None = Field(default=None, ge=1, le=2)


class Wall(BaseModel):
    id: str
    length: float = Field(gt=0.5, lt=25.0)
    elements: list[WallElement] = []


class RoomGeometry(BaseModel):
    # Minimum 3 walls.  Legacy rectangular rooms use exactly 4 walls
    # (index 0=A, 1=B, 2=C, 3=D).  N-wall polygon rooms may have more.
    walls: list[Wall] = Field(min_length=3)
    # Ordered polygon vertices in the floor plane (metres, counter-clockwise).
    # For legacy 4-wall rooms, auto-populated from walls[0].length × walls[1].length
    # by _normalize_polygon so callers don't need to supply them.
    vertices: list[tuple[float, float]] | None = None

    @model_validator(mode="after")
    def _normalize_polygon(self) -> "RoomGeometry":
        """Auto-compute rectangular vertices for legacy 4-wall rooms."""
        if self.vertices is None and len(self.walls) == 4:
            a = self.walls[0].length
            b = self.walls[1].length
            self.vertices = [(0.0, 0.0), (a, 0.0), (a, b), (0.0, b)]
        return self


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ceiling_h: float = Field(ge=1.8, le=6.0)
    geometry: RoomGeometry

    @model_validator(mode="after")
    def check_element_heights(self) -> "RoomCreate":
        for wall in self.geometry.walls:
            for el in wall.elements:
                if el.height + el.sill_height > self.ceiling_h + 0.01:
                    raise ValueError(
                        "Eshik/deraza balandligi shift balandligidan oshib ketmoqda"
                    )
        return self


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    ceiling_h: float | None = Field(default=None, ge=1.8, le=6.0)
    geometry: RoomGeometry | None = None
    surfaces: dict | None = None
    furniture_layout: list | None = None
    state: dict | None = None


class RoomOut(BaseModel):
    id: UUID
    apartment_id: UUID
    name: str
    ceiling_h: float | None
    geometry: dict | None
    surfaces: dict | None
    furniture_layout: list | None
    state: dict | None
    room_scan: dict | None = None
    floor_area: float | None
    net_wall_area: float | None
    perimeter: float | None
    openings_count: int
    updated_at: datetime
    # Resolved to an absolute URL by the router (not read straight off the
    # ORM's thumbnail_key, which is a bare storage key for local dev).
    thumbnail_url: str | None = None

    model_config = {"from_attributes": True}
