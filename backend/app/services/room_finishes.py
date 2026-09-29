"""Resolve a RoomFinish row onto the wall a room actually has.

Background
----------
``room_finishes.surface`` was born hardcoded to a 4-wall rectangle
(``wall_a``..``wall_d`` plus ``floor``/``ceiling``), with a companion
``wall_index`` capped at 3. A LiDAR-scanned room is an N-wall polygon whose
``geometry.walls[].id`` values are ``"0"``, ``"1"``, … — so the 5th wall of
every real scan could not be given a finish at all, and therefore was never
costed in the smeta.

Storage shape
-------------
``surface`` is now a free-form string (VARCHAR(64)) holding EITHER

* ``"floor"`` / ``"ceiling"`` — unchanged, and reserved: no wall may use
  these ids;
* a legacy ``"wall_a"``..``"wall_d"`` value — still accepted from clients and
  still stored verbatim, so every pre-existing row keeps resolving exactly as
  it did; or
* the room's own ``geometry.walls[].id`` (``"0"``, ``"A"``, whatever the
  scan/wizard produced) — the same convention the studio frontend already
  uses (see commits 745d90e3, ca774394, ea9c2537, 0289cc6e).

This is the same "legacy rooms keep A/B/C/D, polygon rooms address walls by
their real id" rule as the frontend, and it has no ceiling: widening a fixed
value list to ``wall_e``..``wall_z`` would only move the limit.

Estimate path
-------------
``compute_estimate`` reads wall→material assignments from ``room.surfaces``
and wall→covering kinds from ``room.state["designState"]["wallCoverings"]``,
both already keyed by the real geometry wall id and already iterating every
wall in ``geometry.walls`` — it is N-wall-clean. What was missing was any
bridge from ``room_finishes`` into it, so a finish never reached the smeta at
all. ``apply_finishes_to_room`` builds that bridge as an overlay UNDER the
room's own values: anything explicitly configured on the room itself still
wins, so an already-configured room's estimate is byte-identical.
"""

from __future__ import annotations

import copy
from typing import Any, Iterable

from fastapi import HTTPException, status

# Reserved non-wall surfaces — unchanged semantics, and never valid wall ids.
NON_WALL_SURFACES: frozenset[str] = frozenset({"floor", "ceiling"})

# Legacy 4-wall rectangle aliases -> positional wall index.
LEGACY_WALL_SURFACES: dict[str, int] = {
    "wall_a": 0,
    "wall_b": 1,
    "wall_c": 2,
    "wall_d": 3,
}

# The geometry wall id a legacy alias maps to on a wizard rectangle, whose
# walls are lettered "A".."D".
LEGACY_WALL_LETTERS: dict[str, str] = {
    "wall_a": "A",
    "wall_b": "B",
    "wall_c": "C",
    "wall_d": "D",
}

MAX_SURFACE_LEN = 64

# finish_type -> the studio's WallCovering "kind". A finish whose type has no
# covering equivalent (tile/laminate/wood/other on a wall) contributes its
# material to `surfaces` but no covering kind, exactly as an unconfigured
# wall behaves today.
FINISH_TYPE_TO_COVERING_KIND: dict[str, str] = {
    "paint": "paint",
    "wallpaper": "oboy",
}


def room_wall_ids(room: Any) -> list[str]:
    """Ordered ``geometry.walls[].id`` for *room*; empty when it has none."""
    geometry: dict = getattr(room, "geometry", None) or {}
    walls = geometry.get("walls") or []
    return [str(w.get("id", "")) for w in walls if isinstance(w, dict)]


def resolve_wall_id(room: Any, surface: str, wall_index: int | None = None) -> str | None:
    """Return the geometry wall id a finish targets, or ``None`` for
    floor/ceiling (and for a room with no geometry at all).

    Resolution order for a legacy ``wall_a``..``wall_d`` alias:
      1. an explicit ``wall_index`` (the column has always meant "which
         wall", and a client that sends it means it);
      2. the lettered id ``"A"``..``"D"`` when the room actually has one;
      3. the positional wall at the alias' own index.
    Any other ``surface`` value IS the wall id, verbatim.
    """
    if surface in NON_WALL_SURFACES:
        return None

    wall_ids = room_wall_ids(room)
    if not wall_ids:
        return None

    if surface in LEGACY_WALL_SURFACES:
        idx = wall_index if wall_index is not None else LEGACY_WALL_SURFACES[surface]
        if wall_index is None:
            letter = LEGACY_WALL_LETTERS[surface]
            if letter in wall_ids:
                return letter
        if 0 <= idx < len(wall_ids):
            return wall_ids[idx]
        return None

    return surface if surface in wall_ids else None


def validate_finish_surface(room: Any, surface: str, wall_index: int | None = None) -> None:
    """422 unless *surface* names a surface *room* actually has.

    A room with no geometry keeps the historical contract exactly: only the
    six legacy values are accepted, since there are no real wall ids to check
    against. A room WITH geometry accepts floor/ceiling, any of its own wall
    ids, and the legacy aliases (which only a 4-wall room can resolve).
    """
    if not surface or len(surface) > MAX_SURFACE_LEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"surface bo'sh bo'lmasligi va {MAX_SURFACE_LEN} belgidan oshmasligi kerak",
        )

    if surface in NON_WALL_SURFACES:
        return

    wall_ids = room_wall_ids(room)

    if not wall_ids:
        if surface in LEGACY_WALL_SURFACES:
            _validate_wall_index(surface, wall_index, None)
            return
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Xonada geometriya yo'q — surface faqat "
                "'wall_a', 'wall_b', 'wall_c', 'wall_d', 'floor' yoki 'ceiling' bo'lishi mumkin"
            ),
        )

    _validate_wall_index(surface, wall_index, len(wall_ids))

    if surface in wall_ids:
        return
    if surface in LEGACY_WALL_SURFACES and resolve_wall_id(room, surface, wall_index) is not None:
        return

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"Xonada '{surface}' nomli yuza yo'q. Mavjud devorlar: "
            f"{', '.join(wall_ids)} (yoki 'floor' / 'ceiling')"
        ),
    )


def _validate_wall_index(surface: str, wall_index: int | None, wall_count: int | None) -> None:
    if wall_index is None:
        return
    if wall_index < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="wall_index manfiy bo'lishi mumkin emas",
        )
    limit = wall_count if wall_count is not None else len(LEGACY_WALL_SURFACES)
    if wall_index >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"wall_index {limit - 1} dan oshmasligi kerak (xonada {limit} ta devor bor)",
        )


def apply_finishes_to_room(room: Any, finishes: Iterable[Any]) -> Any:
    """Return a shallow copy of *room* with ``surfaces`` and
    ``state.designState.wallCoverings`` overlaid from *finishes*.

    The room's own explicitly-configured values always win, so a room the
    studio already configured produces an identical estimate; finishes only
    fill surfaces nothing else has spoken for. Returns *room* itself
    (untouched) when there is nothing to overlay.
    """
    finishes = list(finishes or [])
    if not finishes:
        return room

    surface_overlay: dict[str, str] = {}
    covering_overlay: dict[str, dict] = {}

    for finish in finishes:
        surface = str(getattr(finish, "surface", "") or "")
        if not surface:
            continue
        wall_index = getattr(finish, "wall_index", None)
        material_id = getattr(finish, "material_id", None)
        finish_type = getattr(finish, "finish_type", None)
        color_hex = getattr(finish, "color_hex", None)

        if surface in NON_WALL_SURFACES:
            key = surface
        else:
            key = resolve_wall_id(room, surface, wall_index)
            if key is None:
                # A finish whose wall the room no longer has (geometry was
                # re-scanned under it) is skipped rather than mispriced onto
                # some other wall.
                continue

        if material_id is not None:
            surface_overlay[key] = str(material_id)

        if key in NON_WALL_SURFACES:
            continue
        kind = FINISH_TYPE_TO_COVERING_KIND.get(finish_type or "")
        if kind is not None:
            covering: dict[str, Any] = {"kind": kind}
            if color_hex:
                covering["color"] = color_hex
            if material_id is not None:
                covering["materialId"] = str(material_id)
            covering_overlay[key] = covering

    if not surface_overlay and not covering_overlay:
        return room

    patched = copy.copy(room)

    if surface_overlay:
        merged_surfaces = dict(surface_overlay)
        merged_surfaces.update(room.surfaces or {})  # room's own values win
        patched.surfaces = merged_surfaces

    if covering_overlay:
        state: dict = copy.deepcopy(room.state) if isinstance(room.state, dict) else {}
        if isinstance(state.get("designState"), dict):
            design_state = state["designState"]
            container = state
            nested_key = "designState"
        else:
            # Back-compat with _design_state: a state blob with no
            # "designState" key IS treated as the design state itself.
            design_state = state
            container = None
            nested_key = None
        merged_coverings = dict(covering_overlay)
        existing = design_state.get("wallCoverings")
        if isinstance(existing, dict):
            merged_coverings.update(existing)  # room's own values win
        design_state["wallCoverings"] = merged_coverings
        if container is not None:
            container[nested_key] = design_state
        patched.state = state

    return patched


def finish_material_ids(finishes: Iterable[Any]) -> list[str]:
    """Every distinct non-null ``material_id`` across *finishes*, as strings."""
    seen: dict[str, None] = {}
    for finish in finishes or []:
        mid = getattr(finish, "material_id", None)
        if mid is not None:
            seen.setdefault(str(mid), None)
    return list(seen)
