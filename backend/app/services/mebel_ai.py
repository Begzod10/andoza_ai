"""Mebel AI: a workshop's description of a kitchen → a proposal of cabinets.

The model only fills the `propose_cabinets` tool. Every value is checked
against the same limits the engine uses (app.schemas.mebel.LIMITS_BY_TYPE);
what does not fit is dropped with its reason, and sizes left out take the
type's usual size. The model never works out a part, a cut or a hole: the
frontend engine does, from the cabinets the user accepts.
"""
from __future__ import annotations

from app.config import settings
from app.schemas.mebel import LIMITS_BY_TYPE
from app.services.llm import ToolUseBlock, call_llm, check_and_increment_budget_for

DAILY_LIMIT = 30
MAX_CABINETS = 30

TYPE_DEFAULTS = {
    "base": {"height": 720, "depth": 560, "shelves": 1},
    "wall": {"height": 720, "depth": 300, "shelves": 1},
    "tall": {"height": 2100, "depth": 560, "shelves": 4},
}

SYSTEM_PROMPT = """Siz mebel ustaxonasi uchun buyurtma parametrlarini yig'uvchisiz.
Foydalanuvchi oshxona yoki shkaflarni o'zbek yoki rus tilida tasvirlaydi. Faqat
`propose_cabinets` vositasini chaqiring; detal o'lchamlarini o'zingiz hisoblamang.

Qoidalar:
- Barcha o'lchamlar mm da. "60" yoki "0.6 m" — 600 mm.
- Turlar: "pastki", "нижний", "напольный" → base; "devor", "osma", "навесной", "верхний" → wall;
  "baland", "penal", "пенал", "колонна" → tall.
- "tortmali", "tortma", "ящик", "ящики" → drawers (1–4; aniq aytilmasa 3), faqat base.
  Tortmalarni faqat aytilgan shkaflarga qo'ying: "один с 3 ящиками" yoki "bittasi 3 tortmali"
  — bitta tortmali shkaf (count 1) va qolganlari tortmasiz alohida yoziladi.
- Eshik soni aytilmasa `doors` bermang (avtomatik).
- Bir xil shkaflar uchun `count` ishlating.
- Bitta shkaf eni 150–1200 mm. Uzun qatorni (masalan 2400 mm devor shkaflari) 600–900 lik
  bir nechta shkafga bo'ling, hech qachon 1200 dan keng bitta shkaf bermang.
- Umumiy uzunlik berilsa (masalan 2400 mm), uni `total_length` ga yozing; pastki qatordagi shkaflar enlari yig'indisi unga
  teng bo'lsin; shu devordagi penal ham kiradi. Devor shkaflari qatori ham shu uzunlikdan oshmasin.
- Fasad turi aytilsa: LDSP → "ldsp", MDF/bo'yalgan/плёнка → "mdf".
- Noaniq narsalar (balandlik, chuqurlik, soni) uchun `questions` ga qisqa savol yozing.
  Savollar foydalanuvchi yozgan tilda bo'lsin: ruscha yozsa, savollar ham ruscha.
  Taxmin qilgan o'lchamni ham shkafda bering.
- Foydalanuvchi aytgan har bir shkaf turini o'lchami aytilmasa ham `cabinets` ga qo'shing,
  faqat savol bilan qoldirmang. Devor shkaflari o'lchami aytilmasa: 720×300, 600 lik
  shkaflar bilan pastki qator (penalsiz) ustini egallang; penal: 2100×560.
"""

TOOL = {
    "name": "propose_cabinets",
    "description": "Propose the kitchen cabinets described by the user.",
    "input_schema": {
        "type": "object",
        "properties": {
            "cabinets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": ["base", "wall", "tall"]},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                        "depth": {"type": "integer"},
                        "shelves": {"type": "integer"},
                        "doors": {"type": "integer"},
                        "drawers": {"type": "integer"},
                        "count": {"type": "integer", "minimum": 1, "maximum": 10},
                    },
                    "required": ["type", "width"],
                },
            },
            "facade": {"type": "string", "enum": ["ldsp", "mdf"], "description": "Only when the user names the door material."},
            "total_length": {"type": "integer", "description": "The wall's total length in mm, only when the user gives it."},
            "questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["cabinets", "questions"],
    },
}


_UNREADABLE = object()


def _int(v):
    """A whole number from the model: 600, 600.0 or "600"; None when left out;
    _UNREADABLE for anything else (a fraction, a word, a boolean)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return _UNREADABLE
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else _UNREADABLE
    if isinstance(v, str):
        try:
            f = float(v.strip())
        except ValueError:
            return _UNREADABLE
        return int(f) if f.is_integer() else _UNREADABLE
    return _UNREADABLE


# What the engine needs for a drawer (frontend engine/rules/drawers.ts): a 250 mm slide
# behind the shelves' depth (nailed 4 mm back, 10 mm clearance) and boxes at least 80 high.
DRAWER_MIN_DEPTH = 250 + 10 + 4
DRAWER_GAP = 2
DRAWER_BELOW_FRONT = 40
DRAWER_MIN_BOX = 80


KIND_NAMES = {"base": "pastki shkaf", "wall": "devor shkafi", "tall": "penal"}
FIELD_NAMES = {
    "width": "eni", "height": "balandligi", "depth": "chuqurligi",
    "shelves": "tokchalar", "doors": "eshiklar", "drawers": "tortmalar",
}


def _check(raw: dict) -> tuple[dict | None, str | None]:
    """One proposed cabinet with defaults filled in, or why it was dropped (in Uzbek:
    the user reads it)."""
    kind = raw.get("type")
    if kind not in LIMITS_BY_TYPE:
        return None, f"{kind!r} turi: pastki, devor yoki penal bo'lishi kerak"
    name = KIND_NAMES[kind]
    values = {key: _int(raw.get(key)) for key in ("width", "height", "depth", "shelves", "doors", "drawers")}
    bad = [FIELD_NAMES[key] for key, value in values.items() if value is _UNREADABLE]
    if bad:
        return None, f"{name}: {', '.join(bad)} butun son emas"
    if values["width"] is None:
        return None, f"{name}: eni berilmagan"
    cab = {"type": kind, "width": values["width"]}
    for key, default in TYPE_DEFAULTS[kind].items():
        cab[key] = default if values[key] is None else values[key]
    cab["doors"] = values["doors"]
    cab["drawers"] = values["drawers"] or 0
    for key, (lo, hi) in LIMITS_BY_TYPE[kind].items():
        if not lo <= cab[key] <= hi:
            unit = " mm" if key in ("width", "height", "depth") else ""
            return None, f"{name}: {FIELD_NAMES[key]} {cab[key]}{unit}, {lo}–{hi} bo'lishi kerak"
    if cab["doors"] is not None and not 0 <= cab["doors"] <= 2:
        return None, f"{name}: eshiklar {cab['doors']}, 0–2 bo'lishi kerak"
    if not 0 <= cab["drawers"] <= 4 or (cab["drawers"] and kind != "base"):
        return None, f"{name}: tortmalar {cab['drawers']}, 0–4 va faqat pastki shkafda"
    if cab["drawers"]:
        n = cab["drawers"]
        if cab["depth"] < DRAWER_MIN_DEPTH:
            return None, f"{name}, {n} tortma: chuqurligi {cab['depth']} mm, kamida {DRAWER_MIN_DEPTH} kerak"
        if (cab["height"] - (n + 1) * DRAWER_GAP) // n - DRAWER_BELOW_FRONT < DRAWER_MIN_BOX:
            return None, f"{name}, {n} tortma: balandligi {cab['height']} mm, tortmalar uchun past"
        # a drawer cabinet has neither shelves nor a door
        cab["shelves"] = 0
        cab["doors"] = None
    return cab, None


def _length_warnings(cabinets: list[dict], total) -> list[str]:
    """The model is unreliable at adding up widths, so the sums are checked here: the
    floor row (base and tall cabinets) should fill the length the user gave, and the
    wall row should fit beside the tall cabinets."""
    if not isinstance(total, int) or total <= 0:
        return []
    width = lambda *kinds: sum(c["width"] for c in cabinets if c["type"] in kinds)
    warnings = []
    floor = width("base", "tall")
    if floor and floor != total:
        warnings.append(f"Pastki qator va penal: {floor} mm, matnda {total} mm")
    wall, free = width("wall"), total - width("tall")
    if wall > free:
        warnings.append(f"Devor shkaflari: {wall} mm, penaldan bo'sh joy {free} mm")
    return warnings


async def suggest_cabinets(text: str, user_id: str) -> dict:
    await check_and_increment_budget_for(user_id, "mebel_ai", DAILY_LIMIT)
    response = await call_llm(
        model=settings.AI_MODEL_BUILDER,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
        tools=[TOOL],
        max_tokens=1500,
        # the same description gives the same proposal
        temperature=0,
        user_id=user_id,
        model_type="builder",
    )
    call = next((b for b in response.content if isinstance(b, ToolUseBlock) and b.name == TOOL["name"]), None)
    if call is None:
        said = " ".join(getattr(b, "text", "") for b in response.content).strip()
        return {"cabinets": [], "facade": None, "questions": [said] if said else [], "dropped": [], "warnings": []}

    cabinets: list[dict] = []
    dropped: list[str] = []
    for raw in call.input.get("cabinets") or []:
        cab, why = _check(raw if isinstance(raw, dict) else {})
        if cab is None:
            dropped.append(why or "noto'g'ri shkaf")
            continue
        n = _int(raw.get("count"))
        count = max(1, n if isinstance(n, int) else 1)
        room = MAX_CABINETS - len(cabinets)
        cabinets.extend(dict(cab) for _ in range(min(count, room)))
        if count > room:
            dropped.append(f"{count - room} × {KIND_NAMES[cab['type']]} {cab['width']}: loyihada ko'pi bilan {MAX_CABINETS} ta shkaf")
    facade = call.input.get("facade")
    questions = [q for q in call.input.get("questions") or [] if isinstance(q, str) and q.strip()][:5]
    return {
        "cabinets": cabinets,
        "facade": facade if facade in ("ldsp", "mdf", "none") else None,
        "questions": questions,
        "dropped": dropped,
        "warnings": _length_warnings(cabinets, _int(call.input.get("total_length"))),
    }
