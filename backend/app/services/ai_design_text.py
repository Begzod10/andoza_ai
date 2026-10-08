"""Keeps the words of an AI design honest about its plan.

The model writes a short summary beside the plan, and it may say things the plan does not hold:
"gold fittings" when no colour of the plan is gold (lights and furniture have no colour to choose),
or a piece of furniture that validation dropped. The studio shows the plan as ticked parts and
the summary as its explanation, so a summary that promises more than the plan gives is a lie.

Two things here:
  * ``summary_problems`` reads a summary against the validated plan and lists what it claims that
    the plan does not hold: a colour nobody chose, a piece of furniture or kind of light that is
    not there, a floor or wall finish that is not the one chosen;
  * ``describe_plan`` writes a plain summary from the plan itself, which is true by construction.

``reconcile_summary`` uses the first to decide whether to keep the model's wording and falls back
to the second when it cannot be trusted. The check is deliberately a list of concrete words, not
language understanding: it catches the claims that matter and leaves the model's prose alone
otherwise.
"""
from __future__ import annotations

import colorsys
import re
from typing import Any

from app.services.smeta import LIGHT_TYPE_NAMES

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʻ": "'", "ʼ": "'", "`": "'", "´": "'"})


def _norm(text: str) -> str:
    return text.translate(_APOSTROPHES).lower()


def _hls(hex_color: str) -> tuple[float, float, float]:
    """(hue in degrees, lightness, saturation), each 0..1 except hue."""
    digits = hex_color.lstrip("#")
    r, g, b = (int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, l, s


# ── Colours ──────────────────────────────────────────────────────────────────

# family -> (words that claim it, test a colour must pass to back the claim).
# Only colours with a clear identity are policed; neutrals (white, grey, beige) are too fuzzy to say wrong.
_COLOUR_CLAIMS: dict[str, tuple[re.Pattern[str], Any]] = {
    "oltin/sariq": (re.compile(r"\b(oltin|tilla|gold|sariq)"), lambda h, l, s: 35 <= h <= 70 and s >= 0.5 and 0.2 <= l <= 0.88),
    "qora": (re.compile(r"\bqora\b|\bqoraroq"), lambda h, l, s: l <= 0.2),
    "qizil": (re.compile(r"\b(qizil|bordo)"), lambda h, l, s: (h <= 15 or h >= 340) and s >= 0.35),
    "ko'k": (re.compile(r"\b(ko'k|havorang|moviy|zangori)"), lambda h, l, s: 185 <= h <= 260 and s >= 0.15),
    "yashil": (re.compile(r"\b(yashil|zaytun|zumrad|moxor)"), lambda h, l, s: 70 <= h <= 170 and s >= 0.12),
    "pushti": (re.compile(r"\bpushti"), lambda h, l, s: (300 <= h <= 350) and s >= 0.2 and l >= 0.45),
    "binafsha": (re.compile(r"\b(binafsha|lavanda)"), lambda h, l, s: 255 <= h <= 310 and s >= 0.12),
    "jigarrang": (re.compile(r"\b(jigarrang|qo'ng'ir|shokolad)"), lambda h, l, s: 8 <= h <= 45 and l <= 0.6 and s >= 0.12),
}
_WOOD_FLOORS = ("parquet", "laminate")


def _plan_colours(plan: Any) -> list[str]:
    out: list[str] = []
    main = plan.walls.get("main") or {}
    out += [main.get("color"), main.get("base_color"), main.get("accent_color")]
    out.append((plan.walls.get("accent") or {}).get("color"))
    if plan.floor:
        out.append(plan.floor.get("tint"))
    return [c for c in out if isinstance(c, str) and re.fullmatch(r"#[0-9a-f]{6}", c)]


def _colour_problems(text: str, plan: Any) -> list[str]:
    colours = [_hls(c) for c in _plan_colours(plan)]
    wood_floor = bool(plan.floor and plan.floor.get("type") in _WOOD_FLOORS)
    problems = []
    for family, (words, backs) in _COLOUR_CLAIMS.items():
        if not words.search(text):
            continue
        if any(backs(*c) for c in colours):
            continue
        if family == "jigarrang" and wood_floor:  # a wooden floor is brown, tint or not
            continue
        problems.append(f"'{family}' rang aytilgan, lekin rejada bunday rang yo'q")
    return problems


# A colour word right before a piece of furniture or a light: "qora divan", "oltin chiroq". The studio
# cannot colour either (they come from the catalog as they are), so the claim can never come true.
_ANY_COLOUR = re.compile(
    r"\b(?:oltin\w*|tilla\w*|sariq\w*|qora\w*|qizil\w*|bordo|ko'k\w*|havorang|moviy|zangori|yashil\w*|zaytun\w*|pushti\w*|"
    r"binafsha\w*|jigarrang\w*|qo'ng'ir\w*|oq|kulrang\w*|bej|krem\w*)"
)
_COLOURED_THING = re.compile(
    _ANY_COLOUR.pattern
    + r"(?:\s+(?:(?:uch|ikki|bir)\s+(?:o'rinli|kishilik)|[\w']+))?\s+"
    + r"(?:divan|sofa|karavot|krovat|stol|stul|kreslo|shkaf|tumba|komod|gilam|mebel|qandil|bra\b|torsher|chiroq|lampa)"
)


def _colour_of_things_problems(text: str) -> list[str]:
    m = _COLOURED_THING.search(text)
    return [f"'{m.group(0)}': mebel va chiroqning rangini tanlab bo'lmaydi"] if m else []


# A reply that goes on in English (the model sometimes translates itself) is not what the user reads.
_ENGLISH = re.compile(r"\b(the|is|are|with|and|includes?|floor|walls?|furniture|lighting)\b")


# The studio's own ids for laying patterns: they are not words a person would read.
_RAW_IDS = re.compile(r"\b(herringbone|wood_strip|brick_bond|stake_bond|double_herringbone)\b")


def _language_problems(text: str) -> list[str]:
    if _RAW_IDS.search(text):
        return ["matnda ichki nom bor (inglizcha naqsh nomi)"]
    return ["matn o'zbekcha emas"] if len(_ENGLISH.findall(text)) >= 3 else []


# ── Furniture ────────────────────────────────────────────────────────────────

# Words for the same kind of piece, so "krovat" in the text is backed by a "Karavot" in the plan.
_FURNITURE_KINDS: dict[str, re.Pattern[str]] = {
    "divan": re.compile(r"\b(divan|sofa)"),
    "karavot": re.compile(r"\b(karavot|krovat)"),
    "stol": re.compile(r"\bstol"),
    "stul": re.compile(r"\b(stul|o'rindiq)"),
    "kreslo": re.compile(r"\bkreslo"),
    "shkaf": re.compile(r"\b(shkaf|garderob|javon|vitrina|stellaj|kitob javon)"),
    "tumba": re.compile(r"\b(tumba|komod)"),
    "gilam": re.compile(r"\b(gilam|kovrolin)"),
}


def _furniture_problems(text: str, plan: Any) -> list[str]:
    chosen = _norm(" ".join(f.get("name", "") for f in plan.furniture))
    problems = []
    for kind, words in _FURNITURE_KINDS.items():
        if words.search(text) and not words.search(chosen):
            problems.append(f"'{kind}' aytilgan, lekin rejada yo'q")
    return problems


# ── Lights ───────────────────────────────────────────────────────────────────

# kind of light -> (words in the text, plan light types that back it)
_LIGHT_KINDS: dict[str, tuple[re.Pattern[str], frozenset[str]]] = {
    "qandil": (re.compile(r"\bqandil"), frozenset({"chandelier"})),
    "osma chiroq": (re.compile(r"\bosma chiroq"), frozenset({"pendant"})),
    "bra": (re.compile(r"\bbra\b"), frozenset({"bra"})),
    "torsher": (re.compile(r"\b(torsher|pol chirog)"), frozenset({"floor_lamp"})),
    "LED": (re.compile(r"\bled\b"), frozenset({"led_panel", "led_linear", "led_track"})),
    "spot": (re.compile(r"\b(spot|downlight)"), frozenset({"spotlight", "ies", "downlight"})),
    "trek": (re.compile(r"\b(trek|shina)"), frozenset({"track", "led_track"})),
}


def _light_problems(text: str, plan: Any) -> list[str]:
    chosen = {light["type"] for light in plan.lights}
    return [
        f"'{kind}' aytilgan, lekin rejada bunday chiroq yo'q"
        for kind, (words, types) in _LIGHT_KINDS.items()
        if words.search(text) and not (types & chosen)
    ]


# ── Floor and walls ──────────────────────────────────────────────────────────

_FLOOR_WORDS = {
    "parquet": re.compile(r"\bparket"),
    "laminate": re.compile(r"\blaminat"),
    "tile": re.compile(r"\b(plitka|kafel)"),
    "concrete": re.compile(r"\bbeton"),
}


def _surface_problems(text: str, plan: Any) -> list[str]:
    problems = []
    floor_type = plan.floor.get("type") if plan.floor else None
    for ftype, words in _FLOOR_WORDS.items():
        if words.search(text) and floor_type != ftype:
            problems.append(f"'{ftype}' pol aytilgan, lekin rejada boshqa pol")
    main = plan.walls.get("main") or {}
    if re.search(r"\boboy", text) and main.get("type") != "oboy":
        problems.append("oboy aytilgan, lekin devorlar oboy bilan qoplanmaydi")
    if re.search(r"\bbo'yoq|\bbo'yal", text) and main.get("type") != "paint" and not plan.walls.get("accent"):
        problems.append("bo'yoq aytilgan, lekin devorlar bo'yalmaydi")
    return problems


# Words in a piece's name that say nothing about what it is, so naming them proves nothing.
_NAME_FILLER = frozenset({
    "o'rinli", "kishilik", "katta", "kichik", "yumshoq", "klassik", "zamonaviy", "oddiy", "burchakli", "uzun", "keng",
    "ikki", "uch", "yangi", "eski", "uyali", "qismli", "modeli", "turi", "uchun", "bilan", "sifatli", "premium",
    # the words any description of a room uses, whatever the shop calls its pieces
    "devor", "devorga", "xona", "mebel", "burchak", "markaz", "chiroq", "asosiy", "yordamchi",
})
_WORD = re.compile(r"[a-z']{4,}")


def _catalog_problems(text: str, plan: Any, catalog_names: list[str]) -> list[str]:
    """A piece of the catalog that the plan did not choose, named in the text. The kinds of furniture
    above are a fixed list; this reads the shop's own names, so a "pufik" or "peshtaxta" is caught too."""
    chosen = _norm(" ".join(f.get("name", "") for f in plan.furniture))
    chosen_words = set(_WORD.findall(chosen))
    problems: list[str] = []
    seen: set[str] = set()
    for name in catalog_names:
        for word in _WORD.findall(_norm(name)):
            if word in _NAME_FILLER or word in chosen_words or word in seen:
                continue
            seen.add(word)
            if re.search(rf"\b{re.escape(word)}", text):
                problems.append(f"'{word}' aytilgan, lekin rejada yo'q")
    return problems


def summary_problems(summary: str, plan: Any, catalog_names: list[str] | None = None) -> list[str]:
    """What the summary claims that the plan does not hold; empty when it can be trusted."""
    text = _norm(summary)
    return [
        *(_catalog_problems(text, plan, catalog_names) if catalog_names else []),
        *_language_problems(text),
        *_colour_of_things_problems(text),
        *_colour_problems(text, plan),
        *_furniture_problems(text, plan),
        *_light_problems(text, plan),
        *_surface_problems(text, plan),
    ]


# ── Writing a summary from the plan ──────────────────────────────────────────

def colour_name(hex_color: str) -> str:
    """A plain Uzbek name for a colour, with 'och' (light) or 'to'q' (dark) where it helps."""
    h, l, s = _hls(hex_color)
    if l <= 0.2 and s < 0.35:
        return "qora"
    if l >= 0.93:
        return "oq"
    if s < 0.1:
        base = "kulrang"
    elif 8 <= h < 50 and l <= 0.45:
        base = "jigarrang"
    elif 15 <= h < 50 and s < 0.45 and l >= 0.7:
        base = "bej"
    elif h < 15 or h >= 345:
        base = "qizil"
    elif h < 35:
        base = "to'q sariq"
    elif h < 70:
        base = "sariq"
    elif h < 170:
        base = "yashil"
    elif h < 260:
        base = "ko'k"
    elif h < 300:
        base = "binafsha"
    else:
        base = "pushti"
    if base in ("kulrang", "bej", "jigarrang"):
        return base
    return f"och {base}" if l >= 0.7 else f"to'q {base}" if l <= 0.3 else base


def _in_colour(hex_color: str) -> str:
    """'in that colour': 'qora rangda', 'kulrangda' (the name already says "rang")."""
    name = colour_name(hex_color)
    return f"{name}da" if name.endswith("rang") else f"{name} rangda"


_PATTERN_NAMES = {
    "yolli": "yo'l-yo'li", "damask": "damask", "geometrik": "geometrik", "gul": "gulli",
    "tekstura": "teksturali", "bolalar": "bolalar",
}
_LAYING_NAMES = {
    "herringbone": "yelkan", "double_herringbone": "qo'sh yelkan", "chevron": "shevron",
    "wood_strip": "to'g'ri taxta", "brick_bond": "g'isht terish", "stake_bond": "zinapoya terish",
}
_FLOOR_NAMES = {"parquet": "parket", "laminate": "laminat", "tile": "plitka", "concrete": "beton"}


def describe_plan(plan: Any) -> str:
    """A summary written from the plan alone, so it says exactly what the plan does."""
    parts: list[str] = []

    main = plan.walls.get("main")
    if main and main.get("type") == "oboy":
        text = f"Devorlar {_PATTERN_NAMES.get(main['pattern'], main['pattern'])} oboy bilan qoplanadi ({colour_name(main['base_color'])} asosda)"
        parts.append(text)
    elif main:
        parts.append(f"Devorlar {_in_colour(main['color'])} bo'yaladi")
    accent = plan.walls.get("accent")
    if accent:
        sentence = f"{accent['wall']} devor {_in_colour(accent['color'])} ajratiladi"
        if parts:
            parts[-1] += f", {sentence}"
        else:
            parts.append(sentence[0].upper() + sentence[1:])

    if plan.floor:
        floor = _FLOOR_NAMES.get(plan.floor["type"], plan.floor["type"])
        pattern = f", {_LAYING_NAMES.get(plan.floor['pattern'], 'maxsus')} terishda" if plan.floor.get("pattern") else ""
        parts.append(f"Pol — {floor}{pattern}")

    if plan.lights:
        counts: dict[str, int] = {}
        for light in plan.lights:
            name = LIGHT_TYPE_NAMES.get(light["type"], light["type"]).lower()
            counts[name] = counts.get(name, 0) + 1
        parts.append("Yoritish: " + ", ".join(f"{n} ta {name}" if n > 1 else name for name, n in counts.items()))

    if plan.furniture:
        parts.append("Mebel: " + ", ".join(f["name"] for f in plan.furniture))

    return ". ".join(parts) + "." if parts else ""


def _localise(text: str) -> str:
    """The studio's ids the model sometimes copies into its prose, said in Uzbek instead."""
    for raw, uz in {**_LAYING_NAMES, "parquet": "parket", "laminate": "laminat"}.items():
        text = re.sub(rf"\b{raw}\b", uz, text, flags=re.I)
    return text


def reconcile_summary(plan: Any, catalog_names: list[str] | None = None) -> list[str]:
    """Make ``plan.summary`` say only what the plan holds. Returns what was wrong with the model's
    wording (empty when it was kept as written). *catalog_names* are the shop's own piece names."""
    plan.summary = _localise(plan.summary or "")
    problems = summary_problems(plan.summary, plan, catalog_names) if plan.summary else ["matn bo'sh"]
    if problems:
        plan.summary = describe_plan(plan)
    return problems
