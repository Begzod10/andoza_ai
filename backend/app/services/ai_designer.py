"""A design for the whole room from one sentence.

The user writes what they want ("a dark, moody room", "light Scandinavian", "classic with
gold") and the model chooses what the studio can actually apply: the wall colour or
wallpaper, the floor, the light fittings and a few pieces of furniture from the shop
catalog. It answers with one JSON plan; the studio shows it and applies it on a tap.

Why one call and a fixed menu, not an agent with tools:
  * every choice is an id from a list we hand over, so the answer can be checked
    mechanically and anything invented is dropped, never applied;
  * furniture goes by a short label (F1, F2...) mapped back to the real id here,
    which keeps the prompt small and a made-up id impossible;
  * one request is fast and costs one call, not up to 25.

The model decides WHAT and roughly WHERE ("against wall B", "in the centre"); the exact
positions, avoiding the other pieces, are worked out by the studio, which knows the room's
walls and each model's size.
"""
from __future__ import annotations

import copy
import json
import random
import re
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.config import settings
from app.services.ai_design_text import describe_plan, reconcile_summary
from app.services.design_presets import load_presets, trim_profiles
from app.services.design_image import PreparedImage
from app.services.llm import call_llm
from app.services.smeta import LIGHT_TYPE_NAMES

log = structlog.get_logger(__name__)

FLOOR_TYPES = ("parquet", "tile", "laminate", "concrete")
# The laying patterns exist for wood-like floors; a tile or concrete floor has none.
FLOOR_PATTERNS = ("herringbone", "double_herringbone", "chevron", "wood_strip", "brick_bond", "stake_bond")
WOOD_FLOORS = ("parquet", "laminate")
OBOY_PATTERNS = ("yolli", "damask", "geometrik", "gul", "tekstura", "bolalar")
LIGHT_TYPES = tuple(LIGHT_TYPE_NAMES)
WALL_MOUNTED_LIGHTS = ("bra", "bath")

# What a piece of furniture is FOR; the studio lays pieces out by role (sofa with a coffee table in
# front, chairs around the dining table...), grouped lounge / dining / sleep / work / storage / extra.
FURNITURE_ROLES = (
    "sofa", "armchair", "coffee_table", "tv_unit",
    "dining_table", "dining_chair",
    "bed", "nightstand",
    "desk", "desk_chair",
    "wardrobe", "shelf",
    "decor", "rug",
)

# Name rules, first match wins. "tumbochka" is a bedside table, so it must not reach "tumba" (a TV stand).
_ROLE_BY_NAME: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern, re.I), role) for pattern, role in (
        (r"gilam|rug|carpet|kovrolin", "rug"),
        (r"jurnal|kofe|coffee", "coffee_table"),
        (r"tumbochka|nightstand|prikrovat", "nightstand"),
        (r"\btv\b|televizor|tumba", "tv_unit"),
        (r"ish stuli|ofis stuli|kompyuter stuli|kreslo-kompyuter|office chair|desk chair|(офисн|компьютерн)\S*\s+(стул|кресл)", "desk_chair"),
        (r"yozuv|kompyuter|desk|ish stoli|компьютерн\S*\s+стол", "desk"),
        (r"kreslo|armchair", "armchair"),
        (r"shkaf|garderob|wardrobe", "wardrobe"),
        (r"javon|komod|stellaj|vitrina|bookcase", "shelf"),
    )
)
_ROLE_BY_CATEGORY = {"divan": "sofa", "karavot": "bed", "stol": "dining_table", "stul": "dining_chair"}


def infer_role(category: str | None, name: str) -> str:
    """The role of a catalog piece from its name, then its category; anything else is decor."""
    for pattern, role in _ROLE_BY_NAME:
        if pattern.search(name or ""):
            return role
    return _ROLE_BY_CATEGORY.get(category or "", "decor")


MAX_LIGHTS = 6
MAX_FURNITURE = 8
MAX_PER_ITEM = 2
# A room has one of these; a second sofa or bed is a repeat, not a design.
ONE_PER_ROOM = ("divan", "karavot")
# Light fittings sold as furniture: the plan's own lights already cover them.
_LIGHT_LIKE = re.compile(r"torsher|lyustra|\bbra\b|chiroq|lampa|svetilnik|светиль", re.I)


def furniture_budget(area: float) -> tuple[int, int]:
    """How many pieces a room of *area* m2 can carry: (at least, at most). A small room must not be
    crammed and a big one should not stay bare."""
    for limit, lo, hi in ((4.0, 1, 2), (6.0, 2, 3), (9.0, 3, 4), (14.0, 4, 5), (22.0, 5, 7)):
        if area < limit:
            return lo, hi
    return 6, MAX_FURNITURE
MAX_CATALOG_IN_PROMPT = 60
MIN_FITTING_PIECES = 8

_HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def zones_for(wall_ids: list[str]) -> list[str]:
    """Where in THIS room a piece can go, by the room's own wall ids.

    "center"; "wall_<id>" for each wall; "corner_<a>_<b>" for each pair of neighbouring walls
    (the last wall meets the first). A drawn or scanned room has walls W1..Wn, a plain one A-D:
    the model is told the real names, so its answer needs no translating.
    """
    zones = ["center", *(f"wall_{w}" for w in wall_ids)]
    if len(wall_ids) >= 3:
        zones += [f"corner_{a}_{b}" for a, b in zip(wall_ids, wall_ids[1:] + wall_ids[:1])]
    return zones


class DesignError(Exception):
    """The model's answer had nothing usable in it."""


@dataclass
class DesignPlan:
    title: str = ""
    summary: str = ""
    walls: dict[str, Any] = field(default_factory=dict)
    floor: dict[str, Any] | None = None
    lights: list[dict[str, str]] = field(default_factory=list)
    furniture: list[dict[str, str]] = field(default_factory=list)
    # The ceiling profile, skirting and cornice, in the shape the studio applies for a ready-made
    # style (frontend DesignTrim): {"ceiling": {"design": id}, "skirting": {"id": id},
    # "cornice": {"id": id} | None}. A key that is missing leaves that part as it is; a None
    # cornice takes it off. None when the model chose no trim at all.
    trim: dict[str, Any] | None = None
    warnings: list[str] = field(default_factory=list)
    # Image designs only: what the picture had and what the catalog lacked. Kept out of
    # summary because reconcile_summary (rightly) rejects a summary naming things the
    # plan does not apply, and these notes are about exactly such things.
    image_notes: str = ""

    def is_empty(self) -> bool:
        return not (self.walls or self.floor or self.lights or self.furniture or self.trim)


def _hex(value: Any) -> str | None:
    """'#RRGGBB' from '#abc', 'ABC123', '#aabbcc'; None for anything else."""
    if not isinstance(value, str):
        return None
    m = _HEX.match(value.strip())
    if not m:
        return None
    digits = m.group(1).lower()
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    return f"#{digits}"


def extract_json(text: str) -> dict:
    """The JSON object in a model's reply, which may be fenced or have words around it."""
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.S)
    if fenced:
        cleaned = fenced.group(1).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise DesignError("AI javobida reja topilmadi")
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise DesignError("AI javobi o'qib bo'lmadi") from exc
    if not isinstance(data, dict):
        raise DesignError("AI javobi reja emas")
    return data


SUMMARY_MAX = 600


def _clip_summary(text: str) -> str:
    """The summary, cut at a full sentence if it is too long. A text with no sentence end to cut at is
    dropped (the plan's own description is written instead): half a sentence helps nobody."""
    text = text.strip()
    if len(text) <= SUMMARY_MAX:
        return text
    cut = text[:SUMMARY_MAX]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "), cut.rfind(".") if cut.endswith(".") else -1)
    return cut[: end + 1].strip() if end >= SUMMARY_MAX // 3 else ""


def validate_plan(
    data: dict, furniture_by_label: dict[str, dict], wall_ids: list[str], max_furniture: int = MAX_FURNITURE,
    starting_preset: dict | None = None,
) -> DesignPlan:
    """Keep only what the studio can apply; note what was dropped. Never raises on a bad
    field, only when nothing at all is left. *wall_ids* are the room's own wall ids;
    *starting_preset* is the ready-made style the model was told to start from, if any."""
    zones = set(zones_for(wall_ids))
    first_wall_zone = f"wall_{wall_ids[0]}" if wall_ids else "center"
    plan = DesignPlan(
        title=str(data.get("title") or "")[:80].strip(),
        summary=_clip_summary(str(data.get("summary") or "")),
        image_notes=data["image_notes"].strip()[:600] if isinstance(data.get("image_notes"), str) else "",
    )
    warn = plan.warnings.append

    # --- walls ---
    walls = data.get("walls") if isinstance(data.get("walls"), dict) else {}
    main = walls.get("main") if isinstance(walls.get("main"), dict) else {}
    if main.get("type") == "oboy" and main.get("pattern") in OBOY_PATTERNS:
        base, accent = _hex(main.get("base_color")), _hex(main.get("accent_color"))
        if base and accent:
            plan.walls["main"] = {"type": "oboy", "pattern": main["pattern"], "base_color": base, "accent_color": accent}
        else:
            warn("Oboy ranglari noto'g'ri, o'tkazib yuborildi")
    elif main.get("type") == "paint" or ("color" in main and "type" not in main):
        color = _hex(main.get("color"))
        if color:
            plan.walls["main"] = {"type": "paint", "color": color}
        else:
            warn("Devor rangi noto'g'ri, o'tkazib yuborildi")
    elif main:
        warn("Devor turi noma'lum, o'tkazib yuborildi")
    accent = walls.get("accent")
    if isinstance(accent, dict) and accent.get("wall") in wall_ids and _hex(accent.get("color")):
        plan.walls["accent"] = {"wall": accent["wall"], "color": _hex(accent["color"])}

    # --- floor ---
    floor = data.get("floor")
    if isinstance(floor, dict) and floor.get("type") in FLOOR_TYPES:
        ftype = floor["type"]
        pattern = floor.get("pattern") if floor.get("pattern") in FLOOR_PATTERNS else None
        tint = _hex(floor.get("tint"))
        if ftype not in WOOD_FLOORS:
            if pattern or tint:
                warn("Plitka va beton polga naqsh qo'llanmaydi")
            pattern = tint = None
        elif tint and not pattern:
            pattern = "wood_strip"  # a tint is a property of the laid boards
        plan.floor = {"type": ftype, "pattern": pattern, "tint": tint}
    elif floor:
        warn("Pol turi noma'lum, o'tkazib yuborildi")

    # --- lights ---
    for raw in (data.get("lights") if isinstance(data.get("lights"), list) else []):
        if len(plan.lights) >= MAX_LIGHTS:
            warn(f"Chiroqlar {MAX_LIGHTS} tagacha cheklandi")
            break
        if not isinstance(raw, dict) or raw.get("type") not in LIGHT_TYPES:
            warn("Noma'lum chiroq turi o'tkazib yuborildi")
            continue
        ltype = raw["type"]
        zone = raw.get("zone") if raw.get("zone") in zones else None
        if ltype in WALL_MOUNTED_LIGHTS:
            zone = zone if zone and zone.startswith("wall_") else first_wall_zone
        else:
            zone = zone or "center"
        plan.lights.append({"type": ltype, "zone": zone})

    # --- furniture ---
    counts: dict[str, int] = {}
    kinds: list[str | None] = []
    for raw in (data.get("furniture") if isinstance(data.get("furniture"), list) else []):
        if len(plan.furniture) >= max_furniture:
            warn(f"Mebel {max_furniture} tagacha cheklandi")
            break
        label = raw.get("id") if isinstance(raw, dict) else None
        item = furniture_by_label.get(label) if isinstance(label, str) else None
        if item is None:
            warn("Katalogda yo'q mebel o'tkazib yuborildi")
            continue
        if plan.lights and (item.get("category") == "lampa" or _LIGHT_LIKE.search(item["name"])):
            warn("Chiroq turidagi mebel o'tkazib yuborildi")
            continue
        category = item.get("category")
        if category in ONE_PER_ROOM and any(c == category for c in kinds):
            warn("Bir xil turdagi ikkinchi mebel o'tkazib yuborildi")
            continue
        if counts.get(label, 0) >= MAX_PER_ITEM:
            continue
        counts[label] = counts.get(label, 0) + 1
        role = raw.get("role") if raw.get("role") in FURNITURE_ROLES else infer_role(category, item["name"])
        plan.furniture.append({"id": item["id"], "name": item["name"], "role": role})
        kinds.append(category)

    plan.trim = _validate_trim(data.get("trim"), warn)
    # The model names the ceiling by design only; kept from the starting style, it keeps that
    # style's colour and light strip too (the dark style's dark border ceiling).
    preset_ceiling = (starting_preset or {}).get("trim", {}).get("ceiling") or {}
    if plan.trim and plan.trim.get("ceiling", {}).get("design") == preset_ceiling.get("design") and preset_ceiling.get("settings"):
        plan.trim["ceiling"]["settings"] = copy.deepcopy(preset_ceiling["settings"])

    if plan.is_empty():
        raise DesignError("AI mos tavsiya topa olmadi. Boshqacha yozib ko'ring.")
    return plan


def _validate_trim(raw: Any, warn) -> dict[str, Any] | None:
    """The model's trim ({"ceiling": id, "skirting": id, "cornice": id or null}) in the studio's shape.
    An unknown profile is dropped with a warning, so that part stays as the room has it; a null
    ceiling or skirting means the same. Only a null cornice is applied: a room without one."""
    if not isinstance(raw, dict):
        return None
    profiles = trim_profiles()
    trim: dict[str, Any] = {}
    for kind, wrap in (("ceiling", "design"), ("skirting", "id"), ("cornice", "id")):
        if kind not in raw:
            continue
        value = raw[kind]
        if value is None:
            if kind == "cornice":
                trim["cornice"] = None
        elif isinstance(value, str) and value in profiles[kind]:
            trim[kind] = {wrap: value}
        else:
            warn("Noma'lum shift yoki plintus profili o'tkazib yuborildi")
    return trim or None


# The furniture styles (backend/app/schemas/admin_catalog.py FURNITURE_STYLES) as the menu names
# them, and how a request names them. Neoklassika is matched before klassik, which it contains.
STYLE_LABELS: dict[str, str] = {
    "neoklassika": "Neoklassika", "klassik": "Klassik", "zamonaviy": "Zamonaviy", "hitech": "Hi-Tech",
    "minimalist": "Minimalist", "skandinav": "Skandinav", "loft": "Loft", "milliy": "Milliy",
}
# Every apostrophe a request may carry in o', g' and the like: ASCII, the Uzbek okina (ʻ), the
# curly quotes (’ ‘), the modifier apostrophe (ʼ) and a backtick.
_APOS = "['ʻ’‘ʼ`]"
_STYLE_WORDS: dict[str, re.Pattern[str]] = {
    "neoklassika": re.compile(r"neo[-\s]?klassi|neoclassic", re.I),
    "klassik": re.compile(r"(?<!neo)(?<!neo-)(?<!neo )klassi|(?<!neo)classic", re.I),
    "zamonaviy": re.compile(r"zamonaviy|modern", re.I),
    "hitech": re.compile(r"hi[-\s]?tech|xay[-\s]?tek|хай[-\s]?тек", re.I),
    "minimalist": re.compile(r"minimal", re.I),
    "skandinav": re.compile(r"skandinav|scandi", re.I),
    "loft": re.compile(r"\bloft", re.I),
    "milliy": re.compile(rf"milliy|sharqona|o{_APOS}?zbekona", re.I),
}


def styles_in_prompt(prompt: str) -> set[str]:
    """The furniture styles a request names ("hi-tech uslubida" → {"hitech"})."""
    return {style for style, words in _STYLE_WORDS.items() if words.search(prompt or "")}


def first_style_in_prompt(prompt: str) -> str | None:
    """The style a request names first, by where it appears in the text ("loft va minimalist" →
    loft); two matches at the same place go by FURNITURE_STYLES order (_STYLE_WORDS keeps it).
    Position, not FURNITURE_STYLES order, decides: in that order minimalist comes before loft, and
    the user who wrote "loft va minimalist" asked for a loft room."""
    found = [
        (m.start(), n, style)
        for n, (style, words) in enumerate(_STYLE_WORDS.items())
        if (m := words.search(prompt or ""))
    ]
    return min(found)[2] if found else None


def preset_for_style(style: str) -> dict | None:
    """The ready-made style for a furniture style: the preset with that id first (every furniture
    style has one), then the first preset whose furnitureStyle it is ("dark" is a zamonaviy preset,
    but zamonaviy has its own)."""
    presets = load_presets()
    if style in presets:
        return presets[style]
    return next((p for p in presets.values() if p["furnitureStyle"] == style), None)


_PRESET_WALLS = "ABCD"  # presets are written for a plain room, walls A-D


def _room_zone(zone: str, wall_of: dict[str, str]) -> str | None:
    """A preset zone in this room's wall ids ("corner_CD" → "corner_W3_W4"); None when the room lacks
    one of its walls."""
    if zone == "center":
        return zone
    if zone.startswith("wall_"):
        wall = wall_of.get(zone[5:])
        return f"wall_{wall}" if wall else None
    if zone.startswith("corner_") and len(zone) == 9:
        a, b = wall_of.get(zone[7]), wall_of.get(zone[8])
        return f"corner_{a}_{b}" if a and b else None
    return None


# Moods that name a ready-made style of their own rather than a furniture style, as a request
# names them, and how the starting plan is labelled. Not a bare "to'q": "to'q yashil devorlar" asks
# for a dark green wall, not the dark style. Nor a dark colour in English ("dark green walls") or
# Russian ("тёмно-зелёные"), nor curtains that darken the room ("затемняющие шторы",
# "qorong'ilashtiruvchi parda"). Uzbek is matched in Cyrillic too ("қоронғи хона").
_DARK_COLOURS = r"green|blue|navy|brown|gr[ae]y|black|red|wood|walnut|oak|olive|purple|beige|teal"
_MOOD_WORDS: dict[str, re.Pattern[str]] = {
    "dark": re.compile(
        rf"qorong{_APOS}?i(?!lash)|қоронғи(?!лаш)"
        rf"|\bdark\b(?![\s-]+(?:{_DARK_COLOURS}))|(?<![а-яё])т[её]мн(?!о-)",
        re.I,
    ),
}
MOOD_LABELS: dict[str, str] = {"dark": "Qorong'i"}


def _starting_choice(prompt: str) -> tuple[str, dict] | None:
    """The plan label and ready-made style the request names first: a furniture style's preset or a
    mood's own. Position decides, as between styles ("qorong'i loft" is the dark style, "loft,
    qorong'i" the loft one); at the same place a furniture style goes first."""
    found = [
        (m.start(), n, kind, key)
        for kind, words in ((0, _STYLE_WORDS), (1, _MOOD_WORDS))
        for n, (key, pattern) in enumerate(words.items())
        if (m := pattern.search(prompt or ""))
    ]
    if not found:
        return None
    _, _, kind, key = min(found, key=lambda f: (f[0], f[2], f[1]))
    if kind == 0:
        preset = preset_for_style(key)
        return (STYLE_LABELS.get(key, key), preset) if preset else None
    preset = load_presets().get(key)
    return (MOOD_LABELS[key], preset) if preset else None


# The ready-made style a room type starts from when the request names no style or mood: only a
# suggestion, the request's own colours and materials come first (_DEFAULT_PLAN_RULE).
_ROOM_TYPE_PRESETS: dict[str, str] = {
    "mehmonxona": "zamonaviy", "oshxona": "zamonaviy",
    "yotoqxona": "skandinav", "bolalar": "skandinav", "balkon": "skandinav",
    "kabinet": "minimalist", "hammom": "minimalist",
}


def _room_type_choice(room_type: str | None) -> tuple[str, dict] | None:
    """The plan label and ready-made style *room_type* starts from; None for a room of no known type."""
    preset = load_presets().get(_ROOM_TYPE_PRESETS.get(room_type or "", ""))
    return (STYLE_LABELS.get(preset["id"], preset["id"]), preset) if preset else None


def starting_preset(prompt: str, room_type: str | None = None) -> dict | None:
    """The ready-made style the model starts from for *prompt*: the one it names, else the room
    type's own, else None."""
    choice = _starting_choice(prompt) or _room_type_choice(room_type)
    return choice[1] if choice else None


def furniture_styles_for_prompt(prompt: str) -> set[str]:
    """The furniture styles whose pieces the menu puts first: those the request names, or, when it
    names none, the furniture style of the ready-made style it starts from (a dark room is furnished
    zamonaviy)."""
    named = styles_in_prompt(prompt)
    if named:
        return named
    preset = starting_preset(prompt)
    return {preset["furnitureStyle"]} if preset and preset.get("furnitureStyle") else set()


def _starting_plan(preset: dict, wall_ids: list[str]) -> dict:
    """The preset's walls, floor, lights and trim as the model answers them: walls and zones in this
    room's own wall ids, by position (A is the first wall, B the second...), anything on a wall the room
    does not have left out; trim by profile id. Works on a copy: the presets are cached."""
    wall_of = dict(zip(_PRESET_WALLS, wall_ids))
    walls = copy.deepcopy(preset["walls"])
    accent = walls.get("accent")
    if accent:
        if accent.get("wall") in wall_of:
            accent["wall"] = wall_of[accent["wall"]]
        else:
            del walls["accent"]
    lights = []
    for light in preset["lights"]:
        zone = _room_zone(light["zone"], wall_of)
        if zone:
            lights.append({**light, "zone": zone})
    trim = preset["trim"]
    return {
        "walls": walls,
        "floor": copy.deepcopy(preset["floor"]),
        "lights": lights,
        "trim": {
            "ceiling": trim["ceiling"]["design"] if trim.get("ceiling") else None,
            "skirting": trim["skirting"]["id"] if trim.get("skirting") else None,
            "cornice": trim["cornice"]["id"] if trim.get("cornice") else None,
        },
    }


_CATALOG_ROOM_TYPE = {"bolalar": "yotoqxona", "kabinet": "mehmonxona"}
_KIDS_NAME = re.compile(r"bolalar|детск|kids", re.I)
_PREFERRED_PIECES = {
    "bolalar": lambda i: bool(_KIDS_NAME.search(i.get("name_uz") or "")),
    "kabinet": lambda i: infer_role(i.get("category"), i.get("name_uz") or "") in ("desk", "desk_chair"),
}


def furniture_menu(
    items: list[dict], room_type: str | None, prompt: str = "",
) -> tuple[list[str], dict[str, dict]]:
    """The catalog as short labelled lines for the prompt, and the label -> item map.

    Pieces made for this room type (and those for every room) come first, so a long catalog is
    cut where it matters least; among them, pieces of a style the request names come first, so
    they are not the ones cut. Each line names the piece's styles; an unstyled piece suits any.
    """
    wanted = furniture_styles_for_prompt(prompt)
    # The catalog has no children's room or study (schemas/admin_catalog.py ROOM_TYPES): a children's
    # room takes bedroom pieces, children's ones first; a study takes living-room pieces, desk and
    # desk chair first.
    catalog_type = _CATALOG_ROOM_TYPE.get(room_type or "", room_type)
    preferred = _PREFERRED_PIECES.get(room_type or "")

    def rank(i: dict) -> int:
        return 0 if i.get("room_type") in (None, catalog_type) else 1

    def preferred_rank(i: dict) -> int:
        return 0 if preferred and preferred(i) else 1

    def style_rank(i: dict) -> int:
        return 0 if wanted & set(i.get("styles") or []) else 1

    # Shuffled first, so a catalog bigger than the prompt shows a different slice, and a different
    # choice, each time (the sort is stable and keeps this room type's pieces in front).
    # Lamps are the plan's lights, not furniture: offered here, a model picks a torsher twice.
    pool = [i for i in items if i.get("category") != "lampa" and not _LIGHT_LIKE.search(i["name_uz"])]
    random.shuffle(pool)
    pool.sort(key=lambda i: (rank(i), preferred_rank(i), style_rank(i)))
    # With enough pieces made for this room (or for every room), the others are not offered at all:
    # a dressing table has no place in a living room.
    fitting = [i for i in pool if rank(i) == 0]
    chosen = (fitting if len(fitting) >= MIN_FITTING_PIECES else pool)[:MAX_CATALOG_IN_PROMPT]
    by_label: dict[str, dict] = {}
    lines: list[str] = []
    for n, item in enumerate(chosen, start=1):
        label = f"F{n}"
        by_label[label] = {
            "id": item["id"], "name": item["name_uz"], "category": item["category"], "styles": item.get("styles") or [],
        }
        size = ""
        if item.get("footprint_w") and item.get("footprint_d"):
            # The catalog stores footprints in centimetres.
            size = f", {item['footprint_w'] / 100:g}x{item['footprint_d'] / 100:g} m"
        where = {"pol": "polga", "devor": "devorga", "shift": "shiftga"}.get(item.get("placement") or "", "")
        styles = [STYLE_LABELS[st] for st in (item.get("styles") or []) if st in STYLE_LABELS]
        style = f", uslub: {', '.join(styles)}" if styles else ""
        lines.append(f"{label}: {item['name_uz']} ({item['category']}{size}{', ' + where if where else ''}{style})")
    return lines, by_label


_SYSTEM = """Siz andoza.ai ilovasidagi tajribali interyer dizayneri-assistentsiz. Foydalanuvchi xonasi uchun
bitta mos, uyg'un dizayn tanlaysiz. FAQAT JSON qaytaring, boshqa hech qanday matn yozmang.

Qoidalar:
- Barcha tanlovlar faqat quyida berilgan ro'yxatlardan bo'lsin. Ro'yxatda yo'q narsani o'ylab topmang.
- Ranglar '#RRGGBB' ko'rinishida. Atmosferaga mos, bir-biri bilan uyg'un palitra tuzing: devor, pol, mebel va yorug'lik BIR G'OYAGA xizmat qilsin.
- Atmosfera yorug'ligini (iliq/sovuq, yorqin/xira) chiroq turi va devor rangi orqali bering. Qorong'i atmosfera: to'q devor, to'q pol, kam va iliq chiroqlar. Yorqin: och ranglar, ko'proq yorug'lik.
- Devorni yo'p bo'yoq (paint) yoki oboy (oboy) bilan qoplang. Bitta devorni boshqa rangda (accent) ajratish mumkin.
- Chiroq: odatda 1 ta asosiy (markazda) va 1-3 ta yordamchi. Devor chiroqlari (bra, bath) faqat devorga: zone = wall_<devor id>.
- Mebel: xona turi va o'lchamiga mos narsalar tanlang; soni xabarda "Mebel soni" qatorida beriladi, undan oshirmang va kamaytirmang. Faqat xona turiga mos narsalarni oling va bir xil turdan (masalan ikkita divan) ikkitasini tanlamang. Mebellarni TURLICHA tanlang: har safar bir xil to'plamga yopishib qolmang, katalogdagi boshqa mos narsalarga ham e'tibor bering. Chiroq turini (lyustra, torsher, bra) mebel sifatida qaytadan tanlamang.
  Har bir mebelga vazifa (role) bering, "Vazifalar" qatoridan. Joyini o'zimiz hisoblaymiz.
  Mebel qatorida "uslub: ..." bo'lsa, u shu uslubga mos. So'rovda yoki rasmda uslub aniq bo'lsa (masalan neoklassika, hi-tech, milliy), mebelni avval shu uslubdagilardan tanlang. Uslubi yozilmagan mebel hamma uslubga mos. Mos uslubdagi mebel bo'lmasa, eng yaqinini oling.
  Vazifalar: sofa (divan), armchair (kreslo), coffee_table (jurnal stoli), tv_unit (TV tumba), dining_table (ovqat stoli), dining_chair (ovqat stuli, bitta model tanlang: sonini o'zimiz belgilaymiz), bed (karavot), nightstand (tumbochka), desk (yozuv stoli), desk_chair (ish stuli), wardrobe (shkaf), shelf (javon, stellaj), decor (bezak), rug (gilam).
- Shift profili (trim.ceiling), plintus (trim.skirting) va galtel (trim.cornice): faqat xabardagi ro'yxatlardan. cornice null bo'lsa galtel qo'yilmaydi.
- Bolalar xonasi: yumshoq pastel ranglar (to'yingan, qichituvchi emas), yorqinlik yuqori, qarama-qarshilik past.
- title: 2-4 so'zli nom.
- summary: 2-3 jumla, O'zbek tilida, nima uchun shunday tanlaganingizni tushuntiring. Uni ENG OXIRIDA, hamma narsani tanlab bo'lgach yozing.
  summary FAQAT siz yuqorida tanlagan narsalarni tasvirlasin: devor va pol rangini/materialini, tanlangan chiroq va mebel nomlarini.
  Tanlamagan narsangizni (ro'yxatdagi boshqa mebel, boshqa rang, boshqa pol) tilga olmang va va'da bermang.
  Chiroq va mebelning RANGINI tanlab bo'lmaydi (faqat turini), shuning uchun ularga rang bermang ("oltin chiroq", "qora divan" demang).
  Agar so'rovdagi biror narsani bajarib bo'lmasa (masalan, "oltin detallar"), buni yashirmang: nima qilganingizni ayting
  (masalan, "oltin rang faqat devor aksentida aks etdi") yoki shu narsa haqida jim turing.

JSON shakli:
{
  "title": "...",
  "walls": {
    "main": {"type": "paint", "color": "#RRGGBB"}  yoki  {"type": "oboy", "pattern": "<oboy naqshi>", "base_color": "#RRGGBB", "accent_color": "#RRGGBB"},
    "accent": {"wall": "<devor id>", "color": "#RRGGBB"}   (ixtiyoriy, bo'lmasa null; devor id "Devorlar" ro'yxatidan)
  },
  "floor": {"type": "<pol turi>", "pattern": "<yog'och pol naqshi yoki null>", "tint": "#RRGGBB yoki null"},
  "lights": [{"type": "<chiroq turi>", "zone": "<zona>"}],
  "furniture": [{"id": "F1", "role": "<vazifa>"}],
  "trim": {"ceiling": "<shift profili yoki null>", "skirting": "<plintus profili yoki null>", "cornice": "<galtel profili yoki null>"},
  "summary": "..."
}
Pol naqshi va tint faqat parquet va laminate uchun; plitka va beton uchun null."""


_IMAGE_DEFAULT_PROMPT = "Rasmdagi interyer uslubini shu xonada takrorlang."
_IMAGE_INSTRUCTIONS = (
    "Foydalanuvchi ilhom rasmini yubordi. Rasmdan uslubni o'qing: devor rangi yoki oboy, "
    "pol turi va naqshi, chiroqlar kayfiyati, mebel turlari. Faqat yuqoridagi menyudan eng "
    "yaqinini tanlang. Foydalanuvchi matni rasmdan ustun turadi. summary faqat tanlangan "
    "dizaynni tasvirlasin. JSON ga qo'shimcha \"image_notes\" maydonini qo'shing: unda "
    "rasmdan nimani olganingizni va katalogda nima topilmaganini ochiq ayting (1-3 gap). "
    "Rasmda xona bo'lmasa ham, undagi ranglar va kayfiyatdan foydalaning."
)


# A bedroom this small has no room for a double bed and a passage around it: the model, left alone,
# still picks the 160-180 cm bed and a full wardrobe. Under 10 m2, or under 2.6 m across.
_SMALL_BEDROOM_TYPES = ("yotoqxona", "bolalar")
_SMALL_BEDROOM_AREA = 10.0
_SMALL_BEDROOM_SIDE = 2.6
_SMALL_BEDROOM_LINE = (
    "Xona kichik: bir kishilik karavot (eni 120 sm gacha) va tor shkaf tanlang, "
    "mebelni kamroq oling, o'tish joyi qolsin."
)


def _is_small_bedroom(room: dict, area: float) -> bool:
    if room.get("room_type") not in _SMALL_BEDROOM_TYPES:
        return False
    return area < _SMALL_BEDROOM_AREA or min(room["width"], room["depth"]) < _SMALL_BEDROOM_SIDE


def build_user_message(
    prompt: str, room: dict, light_menu: str, furniture_lines: list[str],
) -> str:
    walls = "; ".join(
        f"{w['id']} {w['length']:g} m" + (f" ({', '.join(w['openings'])})" if w["openings"] else "")
        for w in room["walls"]
    )
    room_type = room.get("room_type") or "xona turi noma'lum"
    area = room.get("area") or room["width"] * room["depth"]
    lo, hi = furniture_budget(area)
    profiles = trim_profiles()
    return "\n".join([
        f"Foydalanuvchi so'rovi: {prompt.strip()}",
        "",
        f"Xona: {room['name']} ({room_type}), "
        f"o'lchami {room['width']:g} x {room['depth']:g} m, shift {room['ceiling_h']:g} m.",
        f"Devorlar (id va uzunligi): {walls}",
        f"Mebel soni: {lo}-{hi} ta (xona {area:.1f} m2).",
        *([_SMALL_BEDROOM_LINE] if _is_small_bedroom(room, area) else []),
        f"Zonalar: {', '.join(zones_for([w['id'] for w in room['walls']]))}",
        "",
        f"Pol turlari: {', '.join(FLOOR_TYPES)}",
        f"Yog'och pol naqshlari: {', '.join(FLOOR_PATTERNS)}",
        f"Oboy naqshlari: {', '.join(p for p in OBOY_PATTERNS if p != 'bolalar')} (bolalar: faqat bolalar xonasi uchun)",
        f"Chiroq turlari: {light_menu}",
        f"Shift profillari: {', '.join(profiles['ceiling'])}",
        f"Plintus profillari: {', '.join(profiles['skirting'])}",
        f"Galtel profillari: {', '.join(profiles['cornice'])}",
        "",
        *_style_guidance(prompt, [w["id"] for w in room["walls"]], room.get("room_type")),
        "Mebel katalogi:",
        *(furniture_lines or ["(katalogda mebel yo'q: furniture bo'sh qolsin)"]),
    ])


_STARTING_PLAN_RULE = (
    "Shu rejadan boshlang. So'rovda aniq aytilgan narsalarni o'zgartiring, qolganini saqlang. "
    "Pol turi va naqshini, chiroq turlarini sababsiz almashtirmang."
)
_NO_STYLE_GUIDANCE = (
    "Pol turini xona turi va atmosferaga qarab tanlang, har doim parket emas: oshxona va hammomda plitka, "
    "loft yoki sanoat ruhida beton.",
    "Qandil faqat klassik va neoklassik ruhda.",
    "So'ralmagan accent devor qo'ymang.",
)
# A room type's plan is a suggestion, not the user's choice: the request's colours and materials
# win over it, and none of it is held "without reason" as a named style's plan is.
_DEFAULT_PLAN_RULE = (
    "Uslub aytilmagan: bu reja xona turiga qarab taklif qilingan boshlang'ich nuqta, xolos. "
    "So'rovdagi rang, atmosfera va material istaklari (masalan iliq ranglar, yorqin, to'q, yog'och) undan ustun: "
    "devor, pol va ranglarni shularga moslab o'zgartiring. So'rovda aytilmagan narsalarda shu rejaga tayaning."
)
_GOLD_WORDS = re.compile(r"oltin|zarhal|gold|золот", re.I)
_GOLD_LINE = "Oltin talab qilingan: aksent yoki oboy accent_color uchun haqiqiy oltin tus (#C9A24B yoki #B8860B)"
# Whole words only: "pochta", "ochiq oshxona" (an open kitchen) and "kam yorug'lik" (little light)
# do not ask for light colours.
_LIGHT_WORDS = re.compile(
    rf"\boch\b|\bochroq\b|\bochiq rang|\byorug{_APOS} rang|\byorug{_APOS}roq|светл|\blight\b", re.I,
)
_LIGHT_LINE = "Aksent ham och va asosiy rangga yaqin bo'lsin"
# Kitchens and bathrooms are tiled whatever the style: a preset's wooden floor is not kept there.
_TILE_ROOMS = ("oshxona", "hammom")


def _style_guidance(prompt: str, wall_ids: list[str], room_type: str | None = None) -> list[str]:
    """The starting plan of the style or mood the request names; when it names none, the room type's
    own as a suggestion with the general floor and chandelier guidance (only that guidance for a room
    of no known type); then the gold and light-colour lines when the request asks for them. Ends with
    a blank line."""
    choice = _starting_choice(prompt)
    named = choice is not None
    choice = choice or _room_type_choice(room_type)
    lines: list[str] = []
    if choice:
        label, preset = choice
        start = _starting_plan(preset, wall_ids)
        if room_type in _TILE_ROOMS:
            start["floor"] = {"type": "tile", "pattern": None, "tint": None}
        lines += [
            f"Boshlang'ich reja ({label}):",
            json.dumps(start, ensure_ascii=False),
            _STARTING_PLAN_RULE if named else _DEFAULT_PLAN_RULE,
        ]
        if not named:
            # Not the accent line: the room type's plan decides the accent wall itself.
            lines += list(_NO_STYLE_GUIDANCE[:2])
    else:
        lines += list(_NO_STYLE_GUIDANCE)
    if _GOLD_WORDS.search(prompt or ""):
        lines.append(_GOLD_LINE)
    if _LIGHT_WORDS.search(prompt or ""):
        lines.append(_LIGHT_LINE)
    return [*lines, ""]


async def design_room(
    prompt: str, room: dict, furniture_items: list[dict], *, user_id: str,
    image: PreparedImage | None = None,
) -> DesignPlan:
    """The plan for *room* from *prompt*, and from *image* when the user sent an
    inspiration picture. Raises DesignError when the answer is unusable;
    BudgetExceededError and provider errors pass through for the router to report.

    With an image the daily limit is the router's own pool, so it is not counted
    against the text designer's here (user_id=None)."""
    lines, by_label = furniture_menu(furniture_items, room.get("room_type"), prompt)
    light_menu = ", ".join(f"{k} ({v})" for k, v in LIGHT_TYPE_NAMES.items())
    message_prompt = prompt if image is None else (prompt or _IMAGE_DEFAULT_PROMPT)
    if image is None:
        content: str | list[dict] = build_user_message(message_prompt, room, light_menu, lines)
    else:
        text = build_user_message(message_prompt, room, light_menu, lines)
        content = [
            {"type": "image", "source": {"type": "base64", "media_type": image.media_type, "data": image.data_b64}},
            {"type": "text", "text": text + "\n\n" + _IMAGE_INSTRUCTIONS},
        ]
    response = await call_llm(
        model=settings.AI_MODEL_BUILDER,
        system=_SYSTEM,
        messages=[{"role": "user", "content": content}],
        max_tokens=2500,
        user_id=user_id if image is None else None,
        model_type="builder",
        timeout=60.0,
        max_retries=2,
        temperature=0.7,
    )
    text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
    log.info("ai_design.answered", chars=len(text))
    area = room.get("area") or room["width"] * room["depth"]
    plan = validate_plan(
        extract_json(text), by_label, [w["id"] for w in room["walls"]], furniture_budget(area)[1],
        starting_preset=starting_preset(message_prompt),
    )
    # The summary must say only what the plan holds: the model promises colours it cannot apply and
    # pieces that validation dropped. Where it does, those sentences go, or when nothing honest is
    # left, the plan's own description is shown instead.
    wrong = reconcile_summary(
        plan, [item["name"] for item in by_label.values()], {item["name"]: item["styles"] for item in by_label.values()},
    )
    if wrong:
        # Trimmed: only the false sentences went, the model's other words are kept.
        replaced = plan.summary == describe_plan(plan)
        log.info("ai_design.summary_replaced" if replaced else "ai_design.summary_trimmed", problems=wrong)
    return plan
