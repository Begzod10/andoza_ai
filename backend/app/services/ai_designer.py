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

import json
import random
import re
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.config import settings
from app.services.ai_design_text import reconcile_summary
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
    warnings: list[str] = field(default_factory=list)
    # Image designs only: what the picture had and what the catalog lacked. Kept out of
    # summary because reconcile_summary (rightly) rejects a summary naming things the
    # plan does not apply, and these notes are about exactly such things.
    image_notes: str = ""

    def is_empty(self) -> bool:
        return not (self.walls or self.floor or self.lights or self.furniture)


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
) -> DesignPlan:
    """Keep only what the studio can apply; note what was dropped. Never raises on a bad
    field, only when nothing at all is left. *wall_ids* are the room's own wall ids."""
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

    if plan.is_empty():
        raise DesignError("AI mos tavsiya topa olmadi. Boshqacha yozib ko'ring.")
    return plan


# The furniture styles (backend/app/schemas/admin_catalog.py FURNITURE_STYLES) as the menu names
# them, and how a request names them. Neoklassika is matched before klassik, which it contains.
STYLE_LABELS: dict[str, str] = {
    "neoklassika": "Neoklassika", "klassik": "Klassik", "zamonaviy": "Zamonaviy", "hitech": "Hi-Tech",
    "minimalist": "Minimalist", "skandinav": "Skandinav", "loft": "Loft", "milliy": "Milliy",
}
_STYLE_WORDS: dict[str, re.Pattern[str]] = {
    "neoklassika": re.compile(r"neo[-\s]?klassi|neoclassic", re.I),
    "klassik": re.compile(r"(?<!neo)(?<!neo-)(?<!neo )klassi|(?<!neo)classic", re.I),
    "zamonaviy": re.compile(r"zamonaviy|modern", re.I),
    "hitech": re.compile(r"hi[-\s]?tech|xay[-\s]?tek|хай[-\s]?тек", re.I),
    "minimalist": re.compile(r"minimal", re.I),
    "skandinav": re.compile(r"skandinav|scandi", re.I),
    "loft": re.compile(r"\bloft", re.I),
    "milliy": re.compile(r"milliy|sharqona|o['ʻ’]?zbekona", re.I),
}


def styles_in_prompt(prompt: str) -> set[str]:
    """The furniture styles a request names ("hi-tech uslubida" → {"hitech"})."""
    return {style for style, words in _STYLE_WORDS.items() if words.search(prompt or "")}


def furniture_menu(
    items: list[dict], room_type: str | None, prompt: str = "",
) -> tuple[list[str], dict[str, dict]]:
    """The catalog as short labelled lines for the prompt, and the label -> item map.

    Pieces made for this room type (and those for every room) come first, so a long catalog is
    cut where it matters least; among them, pieces of a style the request names come first, so
    they are not the ones cut. Each line names the piece's styles; an unstyled piece suits any.
    """
    wanted = styles_in_prompt(prompt)

    def rank(i: dict) -> int:
        return 0 if i.get("room_type") in (None, room_type) else 1

    def style_rank(i: dict) -> int:
        return 0 if wanted & set(i.get("styles") or []) else 1

    # Shuffled first, so a catalog bigger than the prompt shows a different slice, and a different
    # choice, each time (the sort is stable and keeps this room type's pieces in front).
    # Lamps are the plan's lights, not furniture: offered here, a model picks a torsher twice.
    pool = [i for i in items if i.get("category") != "lampa" and not _LIGHT_LIKE.search(i["name_uz"])]
    random.shuffle(pool)
    pool.sort(key=lambda i: (rank(i), style_rank(i)))
    # With enough pieces made for this room (or for every room), the others are not offered at all:
    # a dressing table has no place in a living room.
    fitting = [i for i in pool if rank(i) == 0]
    chosen = (fitting if len(fitting) >= MIN_FITTING_PIECES else pool)[:MAX_CATALOG_IN_PROMPT]
    by_label: dict[str, dict] = {}
    lines: list[str] = []
    for n, item in enumerate(chosen, start=1):
        label = f"F{n}"
        by_label[label] = {"id": item["id"], "name": item["name_uz"], "category": item["category"]}
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
- Oltin/zarhal talab qilinsa: devor aksenti yoki oboy accent_color uchun haqiqiy oltin tus ishlating (masalan #C9A24B yoki #B8860B), boshqa narsani oltin deb atamang.
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
    return "\n".join([
        f"Foydalanuvchi so'rovi: {prompt.strip()}",
        "",
        f"Xona: {room['name']} ({room_type}), "
        f"o'lchami {room['width']:g} x {room['depth']:g} m, shift {room['ceiling_h']:g} m.",
        f"Devorlar (id va uzunligi): {walls}",
        f"Mebel soni: {lo}-{hi} ta (xona {area:.1f} m2).",
        f"Zonalar: {', '.join(zones_for([w['id'] for w in room['walls']]))}",
        "",
        f"Pol turlari: {', '.join(FLOOR_TYPES)}",
        f"Yog'och pol naqshlari: {', '.join(FLOOR_PATTERNS)}",
        f"Oboy naqshlari: {', '.join(p for p in OBOY_PATTERNS if p != 'bolalar')} (bolalar: faqat bolalar xonasi uchun)",
        f"Chiroq turlari: {light_menu}",
        "",
        "Mebel katalogi:",
        *(furniture_lines or ["(katalogda mebel yo'q: furniture bo'sh qolsin)"]),
    ])


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
    if image is None:
        content: str | list[dict] = build_user_message(prompt, room, light_menu, lines)
    else:
        text = build_user_message(prompt or _IMAGE_DEFAULT_PROMPT, room, light_menu, lines)
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
    )
    # The summary must say only what the plan holds: the model promises colours it cannot apply and
    # pieces that validation dropped. Where it does, the plan's own description is shown instead.
    wrong = reconcile_summary(plan, [item["name"] for item in by_label.values()])
    if wrong:
        log.info("ai_design.summary_replaced", problems=wrong)
    return plan
