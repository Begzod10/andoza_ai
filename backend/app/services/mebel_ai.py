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
- Eshik soni aytilmasa `doors` bermang (avtomatik).
- Bir xil shkaflar uchun `count` ishlating.
- Umumiy uzunlik berilsa (masalan 2400 mm), shkaflar enlari yig'indisi unga teng bo'lsin.
- Fasad turi aytilsa: LDSP → "ldsp", MDF/bo'yalgan/плёнка → "mdf".
- Noaniq narsalar (balandlik, chuqurlik, soni) uchun `questions` ga qisqa savol yozing,
  foydalanuvchi tilida. Taxmin qilgan o'lchamni ham shkafda bering.
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
                        "count": {"type": "integer"},
                    },
                    "required": ["type", "width"],
                },
            },
            "facade": {"type": "string", "enum": ["ldsp", "mdf", "none"]},
            "questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["cabinets", "questions"],
    },
}


def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _check(raw: dict) -> tuple[dict | None, str | None]:
    """One proposed cabinet with defaults filled in, or why it was dropped."""
    kind = raw.get("type")
    if kind not in LIMITS_BY_TYPE:
        return None, f"type {kind!r}: base, wall or tall"
    cab = {"type": kind, "width": _int(raw.get("width"))}
    for key, default in TYPE_DEFAULTS[kind].items():
        value = _int(raw.get(key))
        cab[key] = default if value is None else value
    doors = raw.get("doors")
    cab["doors"] = _int(doors) if doors is not None else None
    cab["drawers"] = _int(raw.get("drawers")) or 0
    if cab["width"] is None:
        return None, f"{kind}: width missing"
    for key, (lo, hi) in LIMITS_BY_TYPE[kind].items():
        if not lo <= cab[key] <= hi:
            return None, f"{kind} {key} {cab[key]}: {lo}–{hi}"
    if cab["doors"] is not None and not 0 <= cab["doors"] <= 2:
        return None, f"{kind} doors {cab['doors']}: 0–2"
    if not 0 <= cab["drawers"] <= 4 or (cab["drawers"] and kind != "base"):
        return None, f"{kind} drawers {cab['drawers']}: 0–4, base only"
    if cab["drawers"]:
        cab["shelves"] = 0
    return cab, None


async def suggest_cabinets(text: str, user_id: str) -> dict:
    await check_and_increment_budget_for(user_id, "mebel_ai", DAILY_LIMIT)
    response = await call_llm(
        model=settings.AI_MODEL_BUILDER,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
        tools=[TOOL],
        max_tokens=1500,
        user_id=user_id,
        model_type="builder",
    )
    call = next((b for b in response.content if isinstance(b, ToolUseBlock) and b.name == TOOL["name"]), None)
    if call is None:
        said = " ".join(getattr(b, "text", "") for b in response.content).strip()
        return {"cabinets": [], "facade": None, "questions": [said] if said else [], "dropped": []}

    cabinets: list[dict] = []
    dropped: list[str] = []
    for raw in call.input.get("cabinets") or []:
        cab, why = _check(raw if isinstance(raw, dict) else {})
        if cab is None:
            dropped.append(why or "invalid")
            continue
        count = max(1, _int(raw.get("count")) or 1)
        room = MAX_CABINETS - len(cabinets)
        cabinets.extend(dict(cab) for _ in range(min(count, room)))
        if count > room:
            dropped.append(f"{count - room} × {cab['type']} {cab['width']}: at most {MAX_CABINETS} cabinets")
            break
    facade = call.input.get("facade")
    questions = [q for q in call.input.get("questions") or [] if isinstance(q, str) and q.strip()][:5]
    return {
        "cabinets": cabinets,
        "facade": facade if facade in ("ldsp", "mdf", "none") else None,
        "questions": questions,
        "dropped": dropped,
    }
