"""Pydantic schema for the subset of Apple RoomPlan `CapturedRoom` JSON the
backend consumes — the server-side mirror of the Flutter models in
`lib/features/room_scan/models/captured_room.dart` (Phase 3.1).

Parsing is deliberately defensive (see :func:`parse_captured_room`): unknown
keys are ignored, malformed entries skipped, unknown object categories fall back
to ``other``. This keeps the endpoint tolerant of RoomPlan SDK drift, exactly
like the Dart parser.
"""
from __future__ import annotations

import math
from enum import Enum
from typing import Any

from pydantic import BaseModel


class ScanConfidence(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class ScanObjectCategory(str, Enum):
    table = "table"
    chair = "chair"
    sofa = "sofa"
    bed = "bed"
    storage = "storage"
    refrigerator = "refrigerator"
    stove = "stove"
    sink = "sink"
    toilet = "toilet"
    bathtub = "bathtub"
    washer = "washer"
    television = "television"
    fireplace = "fireplace"
    stairs = "stairs"
    other = "other"


class Vec3(BaseModel):
    x: float
    y: float
    z: float


class ScanTransform(BaseModel):
    """4×4 column-major (Apple `simd_float4x4`); element (row r, col c) at
    index ``c*4 + r``."""

    m: list[float]

    @property
    def translation(self) -> Vec3:
        return Vec3(x=self.m[12], y=self.m[13], z=self.m[14])

    @property
    def y_rotation_rad(self) -> float:
        # local X axis (column 0) projected on XZ
        return math.atan2(self.m[2], self.m[0])


def _identity() -> ScanTransform:
    return ScanTransform(m=[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])


class ScanSurface(BaseModel):
    dimensions: Vec3
    transform: ScanTransform
    confidence: ScanConfidence = ScanConfidence.medium


class ScanObject(BaseModel):
    category: ScanObjectCategory
    dimensions: Vec3
    transform: ScanTransform
    confidence: ScanConfidence = ScanConfidence.medium


class CapturedRoom(BaseModel):
    walls: list[ScanSurface] = []
    doors: list[ScanSurface] = []
    windows: list[ScanSurface] = []
    openings: list[ScanSurface] = []
    objects: list[ScanObject] = []


# ─────────────────────────── defensive parsing ───────────────────────────

def _to_float(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _vec3(raw: Any) -> Vec3 | None:
    if not isinstance(raw, list) or len(raw) < 3:
        return None
    x, y, z = _to_float(raw[0]), _to_float(raw[1]), _to_float(raw[2])
    if x is None or y is None or z is None:
        return None
    return Vec3(x=x, y=y, z=z)


def _transform(raw: Any) -> ScanTransform:
    if not isinstance(raw, list):
        return _identity()
    flat: list[float] = []
    if raw and isinstance(raw[0], list):  # nested 4×4 → flatten column-major
        for col in raw:
            if not isinstance(col, list):
                return _identity()
            for v in col:
                d = _to_float(v)
                if d is None:
                    return _identity()
                flat.append(d)
    else:
        for v in raw:
            d = _to_float(v)
            if d is None:
                return _identity()
            flat.append(d)
    return ScanTransform(m=flat) if len(flat) == 16 else _identity()


def _confidence(raw: Any) -> ScanConfidence:
    if isinstance(raw, str):
        try:
            return ScanConfidence(raw.lower())
        except ValueError:
            return ScanConfidence.medium
    return ScanConfidence.medium


_CATEGORY_ALIASES = {
    "oven": ScanObjectCategory.stove,
    "washerdryer": ScanObjectCategory.washer,
    "dishwasher": ScanObjectCategory.washer,
}


def _category(raw: Any) -> ScanObjectCategory:
    key: str | None = None
    if isinstance(raw, str):
        key = raw
    elif isinstance(raw, dict) and raw:
        key = str(next(iter(raw.keys())))
    if key is None:
        return ScanObjectCategory.other
    key = key.lower()
    if key in _CATEGORY_ALIASES:
        return _CATEGORY_ALIASES[key]
    try:
        return ScanObjectCategory(key)
    except ValueError:
        return ScanObjectCategory.other


def _surfaces(raw: Any) -> list[ScanSurface]:
    out: list[ScanSurface] = []
    if not isinstance(raw, list):
        return out
    for e in raw:
        if not isinstance(e, dict):
            continue
        dims = _vec3(e.get("dimensions"))
        if dims is None:
            continue
        out.append(ScanSurface(
            dimensions=dims,
            transform=_transform(e.get("transform")),
            confidence=_confidence(e.get("confidence")),
        ))
    return out


def _objects(raw: Any) -> list[ScanObject]:
    out: list[ScanObject] = []
    if not isinstance(raw, list):
        return out
    for e in raw:
        if not isinstance(e, dict):
            continue
        dims = _vec3(e.get("dimensions"))
        if dims is None:
            continue
        out.append(ScanObject(
            category=_category(e.get("category")),
            dimensions=dims,
            transform=_transform(e.get("transform")),
            confidence=_confidence(e.get("confidence")),
        ))
    return out


def parse_captured_room(raw: dict) -> CapturedRoom:
    """Defensively parse a raw RoomPlan JSON dict into a [CapturedRoom]."""
    return CapturedRoom(
        walls=_surfaces(raw.get("walls")),
        doors=_surfaces(raw.get("doors")),
        windows=_surfaces(raw.get("windows")),
        openings=_surfaces(raw.get("openings")),
        objects=_objects(raw.get("objects")),
    )
