"""Pure deterministic smeta (estimate) calculation engine.

All monetary arithmetic is done in tiyin (UZS × 100) to avoid floating-point
rounding errors.  The public surface is a single function:

    compute_estimate(room, materials_map, norms_map) -> ComputedEstimate

No database access, no I/O — call it from within a router after loading the
required ORM objects.

Delta mechanic
---------------
``compute_estimate`` accepts optional ``current_state`` / ``floor_state`` /
``ceiling_state`` parameters (construction-progress stage, see
``STAGE_ORDER`` below). Every caller is expected to pass the room's real
``RoomState`` (routers load it and default to "xom" when the room has none
yet — see ``app.routers.estimate`` and ``app.routers.room_state``).  When
omitted (``None``), ``stage_index()`` treats it as "xom" (raw shell) — the
safest default, since it includes every prep line rather than silently
skipping one.

Prep lines whose stage is already behind the room's current progress are
skipped — this is the core of the "delta" mechanic implemented in
``app.services.delta``.  The paint/wallpaper finish line itself is never
skipped: choosing a finish is the whole point of the tool, independent of
how far the room's substrate prep has progressed.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.norm import Norm
    from app.models.room import Room

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROLL_WIDTH_M: float = 1.06        # wallpaper roll width
ROLL_LENGTH_M: float = 10.05      # wallpaper roll length
ROLL_AREA_M2: float = ROLL_WIDTH_M * ROLL_LENGTH_M  # 10.653 m² per roll
PACK_M2: float = 2.13             # laminate pack coverage (from norm; overridable)
PLINTH_PIECE_M: float = 2.5       # standard plinth strip length
DOOR_WIDTH_DEFAULT_M: float = 0.9  # door width assumed when no geometry data

PLASTER_RATE_KG_M2: float = 8.5      # kg of gypsum plaster per m² (~10mm layer)
PLASTER_BAG_KG: int = 30
PLASTER_BAG_PRICE_UZS: int = 65_000     # hardcoded Tashkent 2024 avg

PRIMER_RATE_KG_M2: float = 0.15   # kg of primer per m²
PRIMER_BAG_KG: int = 5
PRIMER_BAG_PRICE_UZS: int = 45_000   # hardcoded Tashkent 2024 avg

PUTTY_RATE_KG_M2: float = 1.2     # kg of putty per m²
PUTTY_BAG_KG: int = 25
PUTTY_BAG_PRICE_UZS: int = 85_000    # hardcoded Tashkent 2024 avg

PLINTH_PIECE_PRICE_UZS: int = 35_000  # per 2.5 m plinth strip

ELEC_POINTS_DEFAULT: int = 8      # sockets + switches estimate per room
ELEC_AVG_RUN_M: float = 8.0
ELEC_SLACK: float = 1.15
ELEC_CABLE_PRICE_UZS: int = 10_000   # UZS per cable-metre estimate

TILE_WASTE: float = 1.10
LAMINAT_WASTE_DEFAULT: float = 1.07

# ---------------------------------------------------------------------------
# Furniture ("equipment") pricing
#
# Placed furniture (room.state['furniture']) references items from the
# frontend's static FURNITURE_CATALOG (frontend/src/lib/furnitureCatalog.ts)
# by a string slug id, e.g. 'couch_84' — a 3D-placement catalog with no
# pricing of its own, entirely separate from the DB-backed Furniture table
# the Do'kon shop prices against (which uses UUID ids). Reconciling the two
# into one priced catalog is a real follow-up; this is the pragmatic bridge
# in the meantime — known slugs get a real reference price, anything else
# (a new catalog item, or a user's own uploaded model) falls back to a
# category-typical estimate and is flagged approximate, same pattern as the
# electrical line above.
FURNITURE_CATALOG_PRICES_UZS: dict[str, int] = {
    "boconcept_hauge_table": 8_000_000,
    "couch_84": 6_000_000,
}
FURNITURE_FALLBACK_PRICE_UZS: int = 2_000_000

NON_WALL_SURFACE_KEYS: frozenset[str] = frozenset({"floor", "ceiling"})

# Waste factors by wallpaper pattern type
WASTE_FACTORS: dict[str, float] = {
    "tekstura": 1.05,
    "yolli": 1.10,
    "damask": 1.15,
    "geometrik": 1.15,
    "gul": 1.15,
    "bolalar": 1.15,
}

# ---------------------------------------------------------------------------
# Construction-progress stages (delta mechanic)
# ---------------------------------------------------------------------------
#
# Mirrors app.models.room_state.VALID_ROOM_STATES:
#   xom        – korobka / raw shell
#   suvoq      – plastered
#   shpaklovka – primed + puttied, ready to paint
#   tayyor     – fully finished
STAGE_ORDER: tuple[str, ...] = ("xom", "suvoq", "shpaklovka", "tayyor")
STAGE_SUVOQ: str = "suvoq"
STAGE_SHPAKLOVKA: str = "shpaklovka"


def stage_index(state: str | None) -> int:
    """Return the ordinal position of *state* in STAGE_ORDER.

    Unknown or ``None`` values are treated as the earliest stage ("xom") —
    the safe default that never over-skips required work.
    """
    if state in STAGE_ORDER:
        return STAGE_ORDER.index(state)
    return 0


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class ComputedLine:
    """A single line item in the smeta."""
    label: str
    formula: str
    qty: float
    unit: str
    unit_price_uzs: int
    subtotal_uzs: int
    category: str = ""
    material_id: str | None = None
    store_name: str | None = None
    is_approximate: bool = False
    warning: str | None = None


@dataclass
class ComputedEstimate:
    """Returned by compute_estimate(); not yet persisted.

    total_exact_uzs / total_approx_uzs split the line items by
    ``is_approximate`` — a fallback-priced furniture item or a prep line
    with no matching Norm row are real spend the user will actually incur,
    just priced less precisely than a line backed by a real catalog
    Material. ``total_uzs`` is their sum (the full expected spend); it used
    to silently drop the approximate portion, which understated the total
    and (via app.services.delta) could collapse delta_savings_uzs to 0
    whenever the only thing distinguishing two stages was an
    approximately-priced prep line.
    """
    lines: list[ComputedLine] = field(default_factory=list)
    total_exact_uzs: int = 0
    total_approx_uzs: int = 0
    total_uzs: int = 0
    total_min: int = 0
    total_max: int = 0
    # An electrical line is always present (compute_estimate always adds
    # one) — has_electrical says whether one exists at all, and
    # electrical_confirmed says whether it's backed by real placed point
    # counts rather than the ELEC_POINTS_DEFAULT fallback. The two used to
    # be conflated under has_electrical alone, which showed "Yo'q" (no
    # electrical work) right next to a visible electrical line whenever the
    # count was only a fallback guess.
    has_electrical: bool = False
    electrical_confirmed: bool = False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _float(value: object, default: float = 0.0) -> float:
    """Safely coerce SQLAlchemy Numeric / Decimal to Python float."""
    if value is None:
        return default
    return float(value)


def _to_metres(v: float) -> float:
    """Auto-convert mm → m when value looks like mm (> 100).

    Phase 5 will remove this heuristic and require metres throughout.
    For now, geometry from the frontend arrives in mm.
    """
    return v / 1000.0 if v > 100 else v


def _make_line(
    *,
    label: str,
    formula: str,
    qty: int | float,
    unit: str,
    price_uzs: int,
    category: str = "",
    material_id: str | None = None,
    store_name: str | None = None,
    is_approximate: bool = False,
    warning: str | None = None,
) -> ComputedLine:
    """Build a ComputedLine with integer tiyin arithmetic for the subtotal."""
    qty_val: float = float(qty)
    # All monetary arithmetic in tiyin (UZS × 100) to avoid float rounding
    price_tiyin: int = round(float(price_uzs) * 100)
    subtotal_tiyin: int = round(qty_val * price_tiyin)
    subtotal_uzs: int = subtotal_tiyin // 100
    return ComputedLine(
        label=label,
        formula=formula,
        qty=qty_val,
        unit=unit,
        unit_price_uzs=int(price_uzs),
        subtotal_uzs=subtotal_uzs,
        category=category,
        material_id=material_id,
        store_name=store_name,
        is_approximate=is_approximate,
        warning=warning,
    )


def _door_widths_m(room: "Room") -> float:
    """Return total door width (metres) from geometry JSONB.

    Geometry format (from RoomGeometry schema):
        {"walls": [{"id": "A", "length": 4.0,
                    "elements": [{"type": "eshik", "width": 0.9, ...}]}]}

    Falls back to openings_count // 2 × 0.9 m when no explicit door data.
    """
    geometry: dict = room.geometry or {}
    walls = geometry.get("walls", [])
    total = sum(
        float(elem.get("width", DOOR_WIDTH_DEFAULT_M))
        for wall in walls
        for elem in wall.get("elements", [])
        if elem.get("type") == "eshik"
    )
    if total > 0:
        return total
    # Fallback: assume half of counted openings are doors. No forced
    # minimum of 1 — a room with openings_count=0 (or unset) genuinely has
    # zero doors, and used to have a phantom door width subtracted from its
    # plinth length regardless.
    door_count = (room.openings_count or 0) // 2
    return door_count * DOOR_WIDTH_DEFAULT_M


def _store_name(material: "Material") -> str | None:
    try:
        return material.store.name if material.store else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Wall-prep line-item computation functions (suvoq → shpaklovka stages)
# ---------------------------------------------------------------------------

def _plaster_line(room: "Room", norms_map: "dict[str, Norm]") -> ComputedLine:
    """Suvoq (wet plaster) — required only when a room starts from 'xom'."""
    net_wall = _float(room.net_wall_area)
    plaster_norm = norms_map.get("suvoq")
    plaster_params = plaster_norm.params if plaster_norm and plaster_norm.params else {}
    rate = float(plaster_params.get("rate_kg_m2", PLASTER_RATE_KG_M2))
    bag_kg = int(plaster_params.get("bag_kg", PLASTER_BAG_KG))
    price = int(plaster_params.get("bag_price_uzs", PLASTER_BAG_PRICE_UZS))
    approximate = plaster_norm is None
    warning = "Norma topilmadi, standart qiymat ishlatildi" if plaster_norm is None else None

    kg = net_wall * rate
    bags = math.ceil(kg / bag_kg) if bag_kg > 0 else 0
    return _make_line(
        label=f"Suvoq (gips) {bag_kg} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {rate} kg/m² = {kg:.1f} kg → {bags} qop"
        ),
        qty=bags,
        unit="qop",
        price_uzs=price,
        category="suvoq",
        is_approximate=approximate,
        warning=warning,
    )


def _grunt_line(room: "Room", norms_map: "dict[str, Norm]") -> ComputedLine:
    """Grunt (primer) — required until a room reaches 'shpaklovka'."""
    net_wall = _float(room.net_wall_area)
    grunt_norm = norms_map.get("grunt")
    grunt_params = grunt_norm.params if grunt_norm and grunt_norm.params else {}
    primer_rate = float(grunt_params.get("rate_kg_m2", PRIMER_RATE_KG_M2))
    primer_bag_kg = int(grunt_params.get("bag_kg", PRIMER_BAG_KG))
    primer_price = int(grunt_params.get("bag_price_uzs", PRIMER_BAG_PRICE_UZS))
    grunt_approximate = grunt_norm is None
    grunt_warning = "Norma topilmadi, standart qiymat ishlatildi" if grunt_norm is None else None

    kg_primer = math.ceil(net_wall * primer_rate)
    bags_primer = math.ceil(kg_primer / primer_bag_kg)
    return _make_line(
        label=f"Grunt (asosiy qatlam) {primer_bag_kg} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {primer_rate} kg/m² "
            f"= {kg_primer} kg → {bags_primer} qop"
        ),
        qty=bags_primer,
        unit="qop",
        price_uzs=primer_price,
        category="grunt",
        is_approximate=grunt_approximate,
        warning=grunt_warning,
    )


def _putty_line(room: "Room", norms_map: "dict[str, Norm]") -> ComputedLine:
    """Shpatlyovka (putty) — required until a room reaches 'shpaklovka'."""
    net_wall = _float(room.net_wall_area)
    putty_norm = norms_map.get("shpatlyovka")
    putty_params = putty_norm.params if putty_norm and putty_norm.params else {}
    putty_rate = float(putty_params.get("rate_kg_m2", PUTTY_RATE_KG_M2))
    putty_bag_kg = int(putty_params.get("bag_kg", PUTTY_BAG_KG))
    putty_price = int(putty_params.get("bag_price_uzs", PUTTY_BAG_PRICE_UZS))
    putty_approximate = putty_norm is None
    putty_warning = "Norma topilmadi, standart qiymat ishlatildi" if putty_norm is None else None

    kg_putty = net_wall * putty_rate
    bags_putty = math.ceil(kg_putty / putty_bag_kg)
    return _make_line(
        label=f"Shpatlyovka {putty_bag_kg} kg qop",
        formula=(
            f"{net_wall:.1f} m² × {putty_rate} kg/m² "
            f"= {kg_putty:.1f} kg → {bags_putty} qop"
        ),
        qty=bags_putty,
        unit="qop",
        price_uzs=putty_price,
        category="shpatlyovka",
        is_approximate=putty_approximate,
        warning=putty_warning,
    )


def _painted_wall_areas(
    room: "Room",
    wall_surfaces_map: dict[str, str],
    materials_map: dict[str, "Material"],
) -> list[tuple[str | None, float, list[str]]]:
    """Group painted walls' net area (m²) by the material actually assigned
    to each wall — a room with two different paint colours on different
    walls must price each colour's walls against its own price, not bill
    every painted wall at whichever material a single arbitrary lookup
    happened to find first.

    Mirrors the per-wall geometry walk in ``_wallpaper_lines`` so a mixed
    paint/oboy room never double-counts a wallpapered wall's area into the
    paint line too (that wall already gets its own roll line).

    A wall counts as painted when its ``wallCoverings`` entry (own key,
    falling back to ``"ALL"``) has ``kind == "paint"`` — the frontend's
    ``WallCovering`` variant, not to be confused with the "boyoq"
    ``Material.category``. When no covering was ever recorded for a wall at
    all, fall back to whichever material category ``surfaces`` assigns it.

    Returns one ``(material_id, area_m2, wall_ids)`` tuple per distinct
    material id found among painted walls — ``material_id`` is ``None``
    when a room has no geometry at all (the caller falls back to
    ``room.net_wall_area`` and whichever boyoq material it already found).
    """
    geometry: dict = room.geometry or {}
    walls_data = geometry.get("walls", [])
    if not walls_data:
        return [(None, _float(room.net_wall_area), [])]

    ceiling_h_m = _to_metres(_float(room.ceiling_h, 2.7))
    wall_coverings: dict = (room.state or {}).get("wallCoverings", {})

    # material_id -> [area_m2, wall_ids] — a plain dict preserves insertion
    # order (first-seen material first), which keeps output deterministic.
    groups: dict[str | None, list] = {}
    for wall in walls_data:
        wall_key = str(wall.get("id", ""))
        covering = wall_coverings.get(wall_key) or wall_coverings.get("ALL")
        if isinstance(covering, dict) and covering.get("kind"):
            is_painted = covering.get("kind") == "paint"
        else:
            mat_id = wall_surfaces_map.get(wall_key) or wall_surfaces_map.get("ALL")
            material = materials_map.get(mat_id) if mat_id else None
            is_painted = bool(material and material.category == "boyoq")
        if not is_painted:
            continue

        raw_length = float(wall.get("length", 0) or 0)
        wall_length_m = _to_metres(raw_length)
        if wall_length_m <= 0:
            continue
        gross_area = wall_length_m * ceiling_h_m
        elements = wall.get("elements", []) or []
        openings_area = sum(
            _to_metres(float(el.get("width", 0) or 0))
            * _to_metres(float(el.get("height", 0) or 0))
            for el in elements
        )
        net_area = max(0.0, gross_area - openings_area)

        mat_id = wall_surfaces_map.get(wall_key) or wall_surfaces_map.get("ALL")
        group = groups.setdefault(mat_id, [0.0, []])
        group[0] += net_area
        group[1].append(wall_key)

    return [(mat_id, area, wall_ids) for mat_id, (area, wall_ids) in groups.items()]


def _paint_only_line(
    material: "Material",
    norm: "Norm",
    net_wall_m2: float,
    wall_ids: list[str],
) -> ComputedLine:
    """Bo'yoq (paint) finish coat only — always required regardless of stage.

    ``net_wall_m2`` must cover ONLY the walls whose finish resolves to paint
    (see ``_painted_wall_area_m2``) — using the whole room's net_wall_area
    here would double-count any wall that is actually wallpapered.
    """
    coverage = _float(norm.coverage_per_unit, 9.0)
    coats = int(norm.coats) if norm.coats else 2

    liters = math.ceil(net_wall_m2 * coats / coverage)
    wall_note = f" (devor {', '.join(wall_ids)})" if wall_ids else ""
    return _make_line(
        label=f"Bo'yoq: {material.name_uz}",
        formula=(
            f"{net_wall_m2:.1f} m²{wall_note} × {coats} qatlam "
            f"÷ {coverage:.1f} m²/litr = {liters} litr"
        ),
        qty=liters,
        unit="litr",
        price_uzs=material.price_uzs,
        category="boyoq",
        material_id=str(material.id),
        store_name=_store_name(material),
    )


def _wallpaper_lines(
    room: "Room",
    wall_surfaces: dict[str, str],
    materials_map: dict[str, "Material"],
    norm: "Norm | None",
    norms_map: "dict[str, Norm]",
) -> list[ComputedLine]:
    """Per-wall oboy (wallpaper) lines.

    Reads wall geometry from room.geometry (lengths may be in mm; applies
    _to_metres heuristic).  Reads which walls have oboy covering from
    room.state['wallCoverings'].  Emits one ComputedLine per wall that has
    an 'oboy' kind covering.

    Purchasing is by strip, not by area: a 10.05 m roll cut into 2.7 m
    ceiling-height strips only yields 3 usable strips (≈8.1 m of the roll's
    10.05 m, not the full 10.653 m² roll area) — the leftover offcut from
    each roll can't be pieced together into a partial strip. Sizing by area
    alone systematically underestimates roll count.
    """
    geometry: dict = room.geometry or {}
    walls_data = geometry.get("walls", [])
    walls_by_id: dict[str, dict] = {str(w.get("id", "")): w for w in walls_data}

    ceiling_h_raw = _float(room.ceiling_h, 2.7)
    ceiling_h_m = _to_metres(ceiling_h_raw)

    state: dict = room.state or {}
    wall_coverings: dict = state.get("wallCoverings", {})

    lines: list[ComputedLine] = []

    # Iterate over actual wall ids from geometry — works for N-wall rooms
    wall_keys = [str(w.get("id", "")) for w in walls_data]
    for wall_key in wall_keys:
        covering = wall_coverings.get(wall_key) or wall_coverings.get("ALL")
        if not covering or not isinstance(covering, dict):
            continue
        if covering.get("kind") != "oboy":
            continue

        wall = walls_by_id.get(wall_key, {})
        raw_length = float(wall.get("length", 0) or 0)
        wall_length_m = _to_metres(raw_length)
        if wall_length_m <= 0:
            continue

        # Openings are NOT subtracted from the strip count below — a strip
        # is cut full-height and hung past a door/window opening in
        # practice (you don't piece together an interrupted strip from two
        # offcuts), so this is informational only, surfaced in the formula.
        elements = wall.get("elements", []) or []
        openings_area = sum(
            _to_metres(float(el.get("width", 0) or 0))
            * _to_metres(float(el.get("height", 0) or 0))
            for el in elements
        )

        pattern_id: str = covering.get("patternId", "") or ""
        # Waste factor: prefer DB norm (oboy_{pattern_id}), fallback to WASTE_FACTORS dict
        pattern_norm = norms_map.get(f"oboy_{pattern_id}") if pattern_id else None
        if pattern_norm is not None:
            waste_factor = _float(pattern_norm.waste_factor, 1.10)
        else:
            waste_factor = WASTE_FACTORS.get(pattern_id, 1.10)

        # Roll dimensions: prefer DB norm params for "oboy", fallback to constants
        oboy_norm = norm  # passed as norm parameter
        oboy_params = getattr(oboy_norm, "params", None) or {}
        roll_width = float(oboy_params.get("roll_width_m", ROLL_WIDTH_M))
        roll_length = float(oboy_params.get("roll_length_m", ROLL_LENGTH_M))

        # Strip-based purchasing: how many full-height strips this wall
        # needs, how many strips a single roll actually yields (a roll's
        # leftover offcut below one ceiling-height is unusable), and how
        # many rolls that requires.
        strips_needed = math.ceil(wall_length_m * waste_factor / roll_width) if roll_width > 0 else 0
        strips_per_roll = max(1, math.floor(roll_length / ceiling_h_m)) if ceiling_h_m > 0 else 1
        rolls_per_wall = math.ceil(strips_needed / strips_per_roll) if strips_per_roll > 0 else 0

        mat_id = wall_surfaces.get(wall_key) or wall_surfaces.get("ALL")
        material = materials_map.get(mat_id) if mat_id else None

        label = (
            f"Oboy devor {wall_key}: {material.name_uz}"
            if material
            else f"Oboy devor {wall_key}"
        )
        openings_note = (
            f" (teshiklar {openings_area:.2f} m² polosaga ta'sir qilmaydi)"
            if openings_area > 0 else ""
        )
        formula = (
            f"Devor {wall_key}: {wall_length_m:.2f} m × {waste_factor:.2f} (isrof) "
            f"÷ {roll_width:.2f} m = {strips_needed} polosa; "
            f"1 rulon = {strips_per_roll} polosa → {rolls_per_wall} rulon"
            f"{openings_note}"
        )

        price_uzs = int(material.price_uzs) if material else 0
        # A wall's covering can reference a material id that no longer
        # resolves (deleted, or never a real row) — that must not become a
        # silent 0-price line counted as "exact": it would quietly deflate
        # the total instead of surfacing that this wall needs a material.
        material_missing = material is None

        lines.append(_make_line(
            label=label,
            formula=formula,
            qty=rolls_per_wall,
            unit="rulon",
            price_uzs=price_uzs,
            category="oboy",
            material_id=str(material.id) if material else None,
            store_name=_store_name(material) if material else None,
            is_approximate=material_missing,
            warning=(
                "Material topilmadi — narx smetaga kirmadi. "
                "Devor uchun material tanlang."
            ) if material_missing else None,
        ))

    return lines


def _laminate_lines(
    room: "Room",
    material: "Material",
    norm: "Norm | None",
    norms_map: "dict[str, Norm]",
) -> list[ComputedLine]:
    """Laminat qoplamasi + plinth."""
    lines: list[ComputedLine] = []
    floor_area = _float(room.floor_area)
    waste = _float(norm.waste_factor, LAMINAT_WASTE_DEFAULT) if norm else LAMINAT_WASTE_DEFAULT
    pack_m2 = _float(norm.coverage_per_unit, PACK_M2) if norm else PACK_M2

    packs = math.ceil(floor_area * waste / pack_m2)
    area_with_waste = floor_area * waste

    lines.append(_make_line(
        label=f"Laminat: {material.name_uz}",
        formula=(
            f"{floor_area:.2f} m² × {waste:.2f} (chiqindi) "
            f"= {area_with_waste:.2f} m² "
            f"÷ {pack_m2:.2f} m²/quti = {packs} quti"
        ),
        qty=packs,
        unit="quti",
        price_uzs=material.price_uzs,
        category="laminat",
        material_id=str(material.id),
        store_name=_store_name(material),
    ))

    lines.append(_plinth_line(room, norms_map))

    return lines


def _plinth_line(room: "Room", norms_map: "dict[str, Norm]") -> ComputedLine:
    """Plintus (skirting board) — floor perimeter minus door widths.

    Shared by every floor covering that needs a skirting board: laminate
    always got one; tile used to get none at all, as if a tiled room's
    walls never meet a floor.
    """
    plintus_norm = norms_map.get("plintus")
    plintus_params = plintus_norm.params if plintus_norm and plintus_norm.params else {}
    plinth_piece_m = float(plintus_params.get("piece_m", PLINTH_PIECE_M))
    plinth_price = int(plintus_params.get("piece_price_uzs", PLINTH_PIECE_PRICE_UZS))
    plinth_approximate = plintus_norm is None
    plinth_warning = "Norma topilmadi, standart qiymat ishlatildi" if plintus_norm is None else None

    door_m = _door_widths_m(room)
    perimeter = _float(room.perimeter)
    plinth_m = max(0.0, perimeter - door_m)
    pieces = math.ceil(plinth_m / plinth_piece_m)
    return _make_line(
        label=f"Plintus ({plinth_piece_m:.1f} m dona)",
        formula=(
            f"Perimetr {perimeter:.2f} m − eshiklar {door_m:.2f} m "
            f"= {plinth_m:.2f} m → {pieces} dona"
        ),
        qty=pieces,
        unit="dona",
        price_uzs=plinth_price,
        category="plintus",
        is_approximate=plinth_approximate,
        warning=plinth_warning,
    )


def _tile_lines(
    room: "Room",
    material: "Material",
    norms_map: "dict[str, Norm]",
) -> list[ComputedLine]:
    """Plitka (floor tile) + plinth — a tiled room's walls meet the floor
    same as a laminate one's; it used to get no skirting board line at all."""
    floor_area = _float(room.floor_area)
    # 2-decimal precision with tiyin math
    m2_tiyin = math.ceil(floor_area * TILE_WASTE * 100)   # 2-decimal fixed-point
    m2_needed = m2_tiyin / 100.0

    # Integer tiyin arithmetic for money
    price_tiyin = int(material.price_uzs) * 100
    subtotal_tiyin = m2_tiyin * int(material.price_uzs)
    subtotal_uzs = subtotal_tiyin // 100

    tile_line = ComputedLine(
        label=f"Plitka: {material.name_uz}",
        formula=(
            f"{floor_area:.2f} m² × {TILE_WASTE:.2f} (chiqindi) "
            f"= {m2_needed:.2f} m²"
        ),
        qty=m2_needed,
        unit="m²",
        unit_price_uzs=int(material.price_uzs),
        subtotal_uzs=subtotal_uzs,
        category="plitka",
        material_id=str(material.id),
        store_name=_store_name(material),
    )
    return [tile_line, _plinth_line(room, norms_map)]


def _furniture_lines(room: "Room") -> list[ComputedLine]:
    """One line per distinct placed furniture item (qty = how many placed).

    Reads room.state['furniture'] — the array PlacedFurniture entries the
    studio saves, each carrying a furniture_id slug. Pricing, in order of
    preference:
      1. A per-item ``unitPriceUzs`` snapshot on the placed entry itself —
         set at import time for a user's own uploaded model, since there is
         no shared slug to look up a price by (each upload mints its own id).
      2. FURNITURE_CATALOG_PRICES_UZS, for built-in catalog slugs.
      3. FURNITURE_FALLBACK_PRICE_UZS, flagged approximate rather than
         silently omitted — an "equipment" total that quietly excludes some
         of the room's own furniture would be misleading, not just
         incomplete.
    """
    state: dict = room.state or {}
    placed: list = state.get("furniture") or []
    if not placed:
        return []

    counts: dict[str, int] = {}
    names: dict[str, str] = {}
    snapshot_prices: dict[str, int] = {}
    for item in placed:
        if not isinstance(item, dict):
            continue
        fid = item.get("furniture_id")
        if not fid:
            continue
        counts[fid] = counts.get(fid, 0) + 1
        name = item.get("name")
        if name and fid not in names:
            names[fid] = str(name)
        snap = item.get("unitPriceUzs")
        if isinstance(snap, (int, float)) and snap > 0 and fid not in snapshot_prices:
            snapshot_prices[fid] = int(snap)

    lines: list[ComputedLine] = []
    for furniture_id, qty in sorted(counts.items()):
        price = snapshot_prices.get(furniture_id) or FURNITURE_CATALOG_PRICES_UZS.get(furniture_id)
        is_approximate = price is None
        if price is None:
            price = FURNITURE_FALLBACK_PRICE_UZS
        label = names.get(furniture_id) or furniture_id
        lines.append(_make_line(
            label=f"Jihoz: {label}",
            formula=f"{qty} dona × {price:,} so'm".replace(",", " "),
            qty=qty,
            unit="dona",
            price_uzs=price,
            category="jihoz",
            is_approximate=is_approximate,
            warning=(
                "Narx taxminiy — bu jihoz uchun aniq narx bazada yo'q."
                if is_approximate else None
            ),
        ))
    return lines


def _electrical_line(
    room: "Room",
    norms_map: "dict[str, Norm]",
) -> ComputedLine:
    """Electrical cable estimate.

    Uses actual placed electrical point counts from room.state when available
    (keys: 'electricals' and 'lights', saved by StudioPage).  Falls back to
    ELEC_POINTS_DEFAULT and marks the line as approximate when no count is found.
    """
    elec_norm = norms_map.get("elektr_kabel")
    elec_params = elec_norm.params if elec_norm and elec_norm.params else {}
    avg_run_m = float(elec_params.get("avg_run_m", ELEC_AVG_RUN_M))
    slack = float(elec_params.get("slack", ELEC_SLACK))
    price_per_m = int(elec_params.get("price_per_m_uzs", ELEC_CABLE_PRICE_UZS))

    norm_warning_suffix = (
        " Norma topilmadi, standart qiymat ishlatildi." if elec_norm is None else ""
    )

    # Derive point count from user-placed electricals and ceiling lights.
    state: dict = room.state or {}
    placed_electricals = state.get("electricals") or []
    placed_lights = state.get("lights") or []
    actual_count = len(placed_electricals) + len(placed_lights)

    if actual_count > 0:
        elec_points = actual_count
        is_approximate = False
        warning_text = (
            "Elektr kabel hisob-kitobi haqiqiy nuqtalar soniga asoslanadi. "
            f"Elektrik sxemasini elektrik ustasi bilan tasdiqlang.{norm_warning_suffix}"
        )
    else:
        elec_points = int(elec_params.get("points_default", ELEC_POINTS_DEFAULT))
        is_approximate = True
        warning_text = (
            "Bu taxminiy hisob: elektr nuqtalari soni kiritilmagan. "
            "Elektrik sxemasini elektrik ustasi bilan "
            f"tasdiqlang.{norm_warning_suffix}"
        )

    cable_m = math.ceil(elec_points * avg_run_m * slack)
    return _make_line(
        label="Elektr kabel (taxminiy)" if is_approximate else "Elektr kabel",
        formula=(
            f"{elec_points} nuqta × {avg_run_m} m × "
            f"{slack} (zaxira) = {cable_m} m"
        ),
        qty=cable_m,
        unit="m",
        price_uzs=price_per_m,
        category="elektr",
        is_approximate=is_approximate,
        warning=warning_text,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_estimate(
    room: "Room",
    materials_map: dict[str, "Material"],
    norms_map: dict[str, "Norm"],
    current_state: str | None = None,
    floor_state: str | None = None,
    ceiling_state: str | None = None,
) -> ComputedEstimate:
    """Compute a full smeta for *room*.

    Parameters
    ----------
    room:
        SQLAlchemy Room ORM instance with all area fields populated.
    materials_map:
        Mapping of ``str(material.id)`` to Material ORM objects.
        Should contain every material referenced by ``room.surfaces``.
    norms_map:
        Mapping of ``norm.material_key`` to Norm ORM objects.
    current_state:
        Construction-progress stage (see STAGE_ORDER). Callers should always
        pass the room's real RoomState (routers default to "xom" — raw
        shell — when a room has none yet). Prep stages already completed
        (suvoq / grunt+shpatlyovka) are skipped — this is the "delta"
        mechanic. Omitting it (``None``) is treated as "xom", the safest
        default: every prep line is included rather than silently skipped.
        See app.services.delta.compute_delta for the full
        current-vs-finished comparison built on top of this.
    floor_state / ceiling_state:
        Optional per-surface overrides. When a surface's stage is already
        "tayyor" (finished), its material line is skipped entirely — the
        surface already exists and needs no further material spend.

    Returns
    -------
    ComputedEstimate
        All line items and rolled-up totals.  No DB writes.
    """
    surfaces: dict[str, str] = room.surfaces or {}
    lines: list[ComputedLine] = []

    # Identify wall vs floor surfaces
    wall_mids = {
        v for k, v in surfaces.items()
        if k not in NON_WALL_SURFACE_KEYS and v
    }
    floor_mid: str | None = surfaces.get("floor")

    wall_materials: list = [
        materials_map[mid] for mid in wall_mids if mid in materials_map
    ]
    wall_categories: set[str] = {m.category for m in wall_materials}

    # Wall surfaces map: wall_key -> material_id (includes 'ALL' key)
    wall_surfaces_map: dict[str, str] = {
        k: v for k, v in surfaces.items()
        if k not in NON_WALL_SURFACE_KEYS and v
    }

    wall_coverings_state: dict = (room.state or {}).get("wallCoverings", {})
    has_any_oboy = any(
        isinstance(c, dict) and c.get("kind") == "oboy"
        for c in wall_coverings_state.values()
    )
    needs_wall_prep = bool(wall_categories) or has_any_oboy

    # ------------------------------------------------------------------ #
    # 0. Wall prep (suvoq → shpaklovka) — delta-gated, computed ONCE      #
    #    regardless of whether the finish is paint or wallpaper, so       #
    #    mixed-finish rooms never double-count prep material.             #
    # ------------------------------------------------------------------ #
    if needs_wall_prep and _float(room.net_wall_area) > 0:
        idx = stage_index(current_state)
        if idx < stage_index(STAGE_SUVOQ):
            lines.append(_plaster_line(room, norms_map))
        if idx < stage_index(STAGE_SHPAKLOVKA):
            lines.append(_grunt_line(room, norms_map))
            lines.append(_putty_line(room, norms_map))

    # ------------------------------------------------------------------ #
    # 1. Paint (boyoq) finish                                             #
    # ------------------------------------------------------------------ #
    if "boyoq" in wall_categories:
        # Fallback material for a wall group whose own assignment doesn't
        # resolve to a real boyoq material — never silently drop that
        # wall's area from the paint total.
        fallback_boyoq_mat = next(m for m in wall_materials if m.category == "boyoq")
        boyoq_norm = norms_map.get("boyoq")
        if boyoq_norm:
            for mat_id, area, wall_ids in _painted_wall_areas(room, wall_surfaces_map, materials_map):
                if area <= 0:
                    continue
                material = materials_map.get(mat_id) if mat_id else None
                if material is None or material.category != "boyoq":
                    material = fallback_boyoq_mat
                lines.append(_paint_only_line(material, boyoq_norm, area, wall_ids))

    # ------------------------------------------------------------------ #
    # 2. Wallpaper (oboy) finish — per-wall from design state             #
    # ------------------------------------------------------------------ #
    if has_any_oboy:
        oboy_norm = norms_map.get("oboy")
        lines.extend(_wallpaper_lines(room, wall_surfaces_map, materials_map, oboy_norm, norms_map))

    # ------------------------------------------------------------------ #
    # 3. Floor covering — skipped entirely when floor_state is finished   #
    # ------------------------------------------------------------------ #
    floor_already_done = floor_state == "tayyor"
    floor_mat = materials_map.get(floor_mid) if floor_mid else None
    if floor_mat is not None and not floor_already_done:
        if floor_mat.category in ("laminat", "parket"):
            laminat_norm = norms_map.get("laminat") or norms_map.get("parket")
            if _float(room.floor_area) > 0:
                lines.extend(_laminate_lines(room, floor_mat, laminat_norm, norms_map))
        elif floor_mat.category == "plitka":
            if _float(room.floor_area) > 0:
                lines.extend(_tile_lines(room, floor_mat, norms_map))

    # ------------------------------------------------------------------ #
    # 4. Furniture ("jihoz") — every distinct item the user has placed     #
    # ------------------------------------------------------------------ #
    lines.extend(_furniture_lines(room))

    # ------------------------------------------------------------------ #
    # 5. Electrical — uses actual point counts from state when available   #
    # ------------------------------------------------------------------ #
    elec_line = _electrical_line(room, norms_map)
    lines.append(elec_line)

    # ------------------------------------------------------------------ #
    # Totals — total_uzs is the FULL expected spend (exact + approximate).
    # Silently dropping approximate lines here used to understate the total
    # and (via app.services.delta) could zero out delta_savings_uzs whenever
    # the only difference between two stages was an approximately-priced
    # prep line with no matching Norm row.
    # ------------------------------------------------------------------ #
    total_exact_uzs = sum(ln.subtotal_uzs for ln in lines if not ln.is_approximate)
    total_approx_uzs = sum(ln.subtotal_uzs for ln in lines if ln.is_approximate)
    total_uzs = total_exact_uzs + total_approx_uzs
    total_min = int(total_uzs * 0.9)
    # Wider band on the approximate portion — its price is a guess, so the
    # upper bound should reflect that it could run considerably higher.
    total_max = int((total_exact_uzs + total_approx_uzs * 1.3) * 1.1)
    # has_electrical: any electrical line at all (there always is one).
    # electrical_confirmed: only when it's backed by real placed point
    # counts, not the ELEC_POINTS_DEFAULT fallback guess.
    has_electrical = any(ln.category == "elektr" for ln in lines)
    electrical_confirmed = any(
        ln.category == "elektr" and not ln.is_approximate for ln in lines
    )

    return ComputedEstimate(
        lines=lines,
        total_exact_uzs=total_exact_uzs,
        total_approx_uzs=total_approx_uzs,
        total_uzs=total_uzs,
        total_min=total_min,
        total_max=total_max,
        has_electrical=has_electrical,
        electrical_confirmed=electrical_confirmed,
    )
