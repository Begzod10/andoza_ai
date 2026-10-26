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

``reconcile_summary`` uses the first to keep the model's wording without its false sentences and
falls back to the second when nothing of it can be trusted. The check is deliberately a list of concrete words, not
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
# Each band covers every colour ``colour_name`` gives that word to, so a summary written from the plan
# always passes; a word for another hue altogether ("qizil" for a blue) is still caught.
_COLOUR_CLAIMS: dict[str, tuple[re.Pattern[str], Any]] = {
    "oltin": (re.compile(r"\b(oltin|tilla|gold)"), lambda h, l, s: 35 <= h <= 70 and s >= 0.45 and 0.2 <= l <= 0.88),
    "sariq": (re.compile(r"(?<!to'q )\bsariq"), lambda h, l, s: 35 <= h <= 70 and s >= 0.1),
    # "to'q sariq" is orange, or a dark yellow: not the plain yellow above
    "to'q sariq": (re.compile(r"\bto'q sariq"), lambda h, l, s: 15 <= h <= 70 and s >= 0.1),
    "qora": (re.compile(r"\bqora\b|\bqoraroq"), lambda h, l, s: l <= 0.2),
    "qizil": (re.compile(r"\b(qizil|bordo)"), lambda h, l, s: (h <= 15 or h >= 340) and s >= 0.1),
    "ko'k": (re.compile(r"\b(ko'k|havorang|moviy|zangori)"), lambda h, l, s: 170 <= h <= 260 and s >= 0.1),
    "yashil": (re.compile(r"\b(yashil|zaytun|zumrad|moxor)"), lambda h, l, s: 70 <= h <= 170 and s >= 0.1),
    "pushti": (re.compile(r"\bpushti"), lambda h, l, s: (300 <= h <= 350) and s >= 0.1),
    "binafsha": (re.compile(r"\b(binafsha|lavanda)"), lambda h, l, s: 255 <= h <= 310 and s >= 0.1),
    "jigarrang": (re.compile(r"\b(jigarrang|qo'ng'ir|shokolad)"), lambda h, l, s: 8 <= h <= 50 and l <= 0.6 and s >= 0.1),
}
_WOOD_FLOORS = ("parquet", "laminate")
# Any colour word, policed or neutral, with its endings ("qoraroq", "ko'kish").
_ANY_COLOUR = re.compile(
    r"\b(?:oltin\w*|tilla\w*|sariq\w*|qora\w*|qizil\w*|bordo|ko'k\w*|havorang|moviy|zangori|yashil\w*|zaytun\w*|pushti\w*|"
    r"binafsha\w*|jigarrang\w*|qo'ng'ir\w*|oq|kulrang\w*|bej|krem\w*)"
)


def _plan_colours(plan: Any) -> list[str]:
    out: list[str] = []
    main = plan.walls.get("main") or {}
    out += [main.get("color"), main.get("base_color"), main.get("accent_color")]
    out.append((plan.walls.get("accent") or {}).get("color"))
    if plan.floor:
        out.append(plan.floor.get("tint"))
    return [c for c in out if isinstance(c, str) and re.fullmatch(r"#[0-9a-f]{6}", c)]


# Materials a colour word may describe instead of the paint: "qora metall oyoqlar", "oq marmar".
_MATERIALS = (
    "metall", "marmar", "mramor", "beton", "yog'och", "shisha", "xrom", "charm",
    "plastik", "rattan", "bambuk", "mato", "teri", "eman", "yong'oq", "temir", "latun", "baxmal", "velvet",
)
# The colour word itself, when a material follows it; the material stays for the other checks.
_COLOUR_OF_MATERIAL = re.compile(_ANY_COLOUR.pattern + rf"(?=\s+(?:{'|'.join(_MATERIALS)}))")
# A clause about a wall: a material there ("qora metall panel", "aksent devor qora marmar") is the wall's colour.
_WALL_WORDS = re.compile(r"\b(?:devor|panel|fon(?:i|da|ida)?\b|aksent|urg'u)")
_CLAUSE = re.compile(r"[^.,;:!?]+")


def _without_material_colours(text: str) -> str:
    """*text* without the colour words of a material, except in a clause that speaks of a wall."""
    return _CLAUSE.sub(lambda m: m[0] if _WALL_WORDS.search(m[0]) else _COLOUR_OF_MATERIAL.sub(" ", m[0]), text)
# Two colour words joined into one ("ko'k-yashil"): a shade between them, so either may back it.
_COMPOUND = re.compile(r"\b([a-z']+)-([a-z']+)\b")


def _colour_problems(text: str, plan: Any) -> list[str]:
    colours = [_hls(c) for c in _plan_colours(plan)]
    wood_floor = bool(plan.floor and plan.floor.get("type") in _WOOD_FLOORS)

    def backed(family: str) -> bool:
        if family == "jigarrang" and wood_floor:  # a wooden floor is brown, tint or not
            return True
        return any(_COLOUR_CLAIMS[family][1](*c) for c in colours)

    def families(word: str) -> list[str]:
        return [family for family, (words, _) in _COLOUR_CLAIMS.items() if words.search(word)]

    # Neither a material's colour (away from a wall) nor a compound with one fitting part claims anything
    # about the paint, so they are taken out of the text before the claims are read.
    text = _without_material_colours(text)
    text = _COMPOUND.sub(lambda m: " " if any(map(backed, families(m[1]) + families(m[2]))) else m[0], text)
    return [
        f"'{family}' rang aytilgan, lekin rejada bunday rang yo'q"
        for family, (words, _) in _COLOUR_CLAIMS.items()
        if words.search(text) and not backed(family)
    ]


# A colour word right before a piece of furniture or a light: "qora divan", "oltin chiroq". The studio
# cannot colour either (they come from the catalog as they are), so the claim can never come true.
_COLOURED_THING = re.compile(
    _ANY_COLOUR.pattern
    + r"(?:\s+(?:(?:uch|ikki|bir)\s+(?:o'rinli|kishilik)|[\w']+))?\s+"
    + r"(?:divan|sofa|karavot|krovat|stol|stul|kreslo|shkaf|tumba|komod|gilam|mebel|qandil|bra\b|torsher|chiroq|lampa)"
)


_NAME_WORD = re.compile(r"[\w']+")


def _names_a_piece(words: list[str], names: list[set[str]]) -> bool:
    """Whether every one of *words* is in one chosen piece's name, in any order ("kulrang gilam" for
    "Gilam kulrang"). Each word is the name's own, except that the last, the noun, may carry an ending
    the name lacks ("gilamlar" for "gilam"). A name's word under 3 letters (a model's "L") never counts."""
    *exact, noun = words

    def has(name: set[str]) -> bool:
        long = {n for n in name if len(n) >= 3}
        return all(w in long for w in exact) and any(noun.startswith(n) for n in long)
    return any(has(name) for name in names)


def _colour_of_things_problems(text: str, plan: Any) -> list[str]:
    # A colour word that is part of a chosen piece's own name names that piece; it claims nothing.
    names = [set(_NAME_WORD.findall(_norm(f.get("name", "")))) for f in plan.furniture]
    for m in _COLOURED_THING.finditer(text):
        # The match stops at the noun's stem ("gilam" of "gilamlar"): take the whole word.
        rest = _NAME_WORD.match(text, m.end())
        words = _NAME_WORD.findall(m.group(0) + (rest.group(0) if rest else ""))
        if not _names_a_piece(words, names):
            return [f"'{m.group(0)}': mebel va chiroqning rangini tanlab bo'lmaydi"]
    return []


# A reply that goes on in English (the model sometimes translates itself) is not what the user reads.
_ENGLISH = re.compile(r"\b(the|is|are|with|and|includes?|floor|walls?|furniture|lighting)\b")


# The studio's own ids for laying patterns: they are not words a person would read.
_RAW_IDS = re.compile(r"\b(herringbone|wood_strip|brick_bond|stake_bond|double_herringbone)\b")


# The trim words of the studio's menu ("ceiling trim border", "skirting"): the user reads shift, plintus, galtel.
_TRIM_WORDS = re.compile(r"\b(ceiling|trim|border|skirting|cornice)\b")
# Trim ids that are plain Uzbek words, so the prose may say them ("tekis" is flat).
_UZBEK_TRIM_IDS = frozenset({"tekis"})


def _plan_trim_ids(plan: Any) -> list[str]:
    """The plan's own profile ids. Only these: a shop's names carry model codes of the same look (B054)."""
    trim = getattr(plan, "trim", None) or {}
    ids = [(trim.get(kind) or {}).get(key) for kind, key in (("ceiling", "design"), ("skirting", "id"), ("cornice", "id"))]
    return [i.lower() for i in ids if isinstance(i, str) and i.lower() not in _UZBEK_TRIM_IDS]


# The short labels the prompt gives the pieces (F1, F2...): they mean nothing to the user.
_PIECE_LABELS = re.compile(r"\bf\d+\b")


def _language_problems(text: str, plan: Any, catalog_names: list[str] | None = None) -> list[str]:
    if _RAW_IDS.search(text):
        return ["matnda ichki nom bor (inglizcha naqsh nomi)"]
    # A label that is part of a shop's own name ("Divan F1 Lux") is the name, not the prompt's label.
    names = _norm(" ".join([*(f.get("name", "") for f in plan.furniture), *(catalog_names or [])]))
    if set(_PIECE_LABELS.findall(text)) - set(_PIECE_LABELS.findall(names)):
        return ["matnda ichki nom bor (mebel belgisi)"]
    if _TRIM_WORDS.search(text) or any(re.search(rf"\b{_id_pattern(i)}\b", text) for i in _plan_trim_ids(plan)):
        return ["matnda ichki nom bor (shift yoki plintus profili)"]
    return ["matn o'zbekcha emas"] if len(_ENGLISH.findall(text)) >= 3 else []


# ── Furniture ────────────────────────────────────────────────────────────────

# A wardrobe for clothes (the frontend's WARDROBE_NAME) and a shelf for books or show: both are a "shkaf"
# in the shop's words, but a bookcase does not back "kiyim shkafi".
_WARDROBE = r"kiyim shkaf|garderob|wardrobe|шкаф для одежды|гардероб"
_SHELF = r"kitob javon|kitob shkaf|javon|stellaj|vitrina"

# kind -> (words in the text, words of a chosen name that back them), so "krovat" in the text is backed
# by a "Karavot" in the plan. Where the text says it the same way the name does, the two are one pattern.
_FURNITURE_KINDS: dict[str, tuple[re.Pattern[str], re.Pattern[str]]] = {
    kind: (words, backing or words)
    for kind, words, backing in (
        ("divan", re.compile(r"\b(divan|sofa)"), None),
        ("karavot", re.compile(r"\b(karavot|krovat)"), None),
        ("stol", re.compile(r"\bstol"), None),
        ("stul", re.compile(r"\b(stul|o'rindiq)"), None),
        ("kreslo", re.compile(r"\bkreslo"), None),
        ("kiyim shkafi", re.compile(rf"\b({_WARDROBE})"), None),
        ("javon", re.compile(rf"\b({_SHELF})"), None),
        # a plain "shkaf" says only "a cupboard": any of them backs it, a wardrobe or a shelf alike
        ("shkaf", re.compile(r"(?<!kiyim )(?<!kitob )\bshkaf"), re.compile(rf"shkaf|{_WARDROBE}|{_SHELF}")),
        ("tumba", re.compile(r"\b(tumba|komod)"), None),
        ("gilam", re.compile(r"\b(gilam|kovrolin)"), None),
    )
}


# Spaces of any kind, or a hyphen, between two words: "kiyim shkafi" is "kiyim  shkafi" or "kiyim-shkafi".
_JOIN = re.compile(r"(?<=\w)(?:\s+|\s*-\s*)(?=\w)")


def _furniture_problems(text: str, plan: Any) -> list[str]:
    # The two-word kinds ("kiyim shkaf", "kitob javon") read one plain space between the words.
    text = _JOIN.sub(" ", text)
    chosen = _JOIN.sub(" ", _norm(" ".join(f.get("name", "") for f in plan.furniture)))
    problems = []
    for words, backing in _FURNITURE_KINDS.values():
        # the words as the text says them: "kitob shkaf" is a shelf, where the kind's name would say "javon"
        if (m := words.search(text)) and not backing.search(chosen):
            problems.append(f"'{m.group(0)}' aytilgan, lekin rejada yo'q")
    return problems


# A style is given to the furniture when it is said beside it: "mebel", a kind of piece or a word of a
# chosen piece's name within two words either way ("minimalist divan", "skandinav uslubidagi mebel",
# "mebel sifatida loft uslubida", "minimalist uslubdagi Line va Mono", "Line va Mono minimalist uslubida").
# "Minimalist mehmonxona" or "skandinav uslubidagi xonada divan" is about the room.
_FURNITURE_TALK = re.compile(r"\bmebel|" + "|".join(words.pattern for words, _ in _FURNITURE_KINDS.values()))
_NEAR = 2
# A request may say "minimal" for the style; prose says "minimal miqdorda" (a small amount) too.
_STYLE_IN_PROSE = {"minimalist": re.compile(r"\bminimalist")}
_OF_MATERIALS = re.compile(r"\s+material")


def _names_said(plan: Any) -> re.Pattern[str] | None:
    """The chosen pieces' names as a text says them: whole, or without their short words ("Stellaj Loft"
    for "ZZ Stellaj Loft"), any spacing, the longest first."""
    said: set[str] = set()
    for f in plan.furniture:
        words = _NAME_WORD.findall(_norm(f.get("name", "")))
        for kept in (words, [w for w in words if len(w) >= 3]):
            if kept:
                said.add(r"\s+".join(map(re.escape, kept)))
    return re.compile(r"\b(?:" + "|".join(sorted(said, key=len, reverse=True)) + r")\b") if said else None


def _style_problems(text: str, plan: Any, piece_styles: dict[str, list[str]]) -> list[str]:
    """A style given to the furniture that no chosen piece has. A piece with no style suits every style,
    and so does one *piece_styles* does not know."""
    # The designer's own vocabulary of styles; imported here, as the designer imports this module.
    from app.services.ai_designer import _STYLE_WORDS, STYLE_LABELS

    chosen = [piece_styles.get(f.get("name", "")) for f in plan.furniture]
    if not chosen or any(not styles for styles in chosen):
        return []
    held = {style for styles in chosen for style in styles}
    names = {w for f in plan.furniture for w in _NAME_WORD.findall(_norm(f.get("name", "")))
             if len(w) >= 4 and w not in _NAME_FILLER}
    # A chosen piece's name is read as "mebel": it names a piece, and a style word of its own ("ZZ Stellaj
    # Loft", "Klassik divan") is the shop's name, no claim; a style said beside it still is.
    if names_said := _names_said(plan):
        text = names_said.sub("mebel", text)
    problems: list[str] = []
    for sentence in _SENTENCE_END.split(text):
        tokens = list(_NAME_WORD.finditer(sentence))
        words_of, starts = [t[0] for t in tokens], [t.start() for t in tokens]

        def beside_furniture(m: re.Match[str]) -> bool:
            first = max(i for i, at in enumerate(starts) if at <= m.start())
            last = max(i for i, at in enumerate(starts) if at < m.end())
            near = words_of[max(0, first - _NEAR) : first] + words_of[last + 1 : last + 1 + _NEAR]
            return any(_FURNITURE_TALK.match(w) or w in names for w in near)

        for style, words in _STYLE_WORDS.items():
            claim = f"'{STYLE_LABELS[style]}' uslubdagi mebel aytilgan, lekin tanlangan mebel bu uslubda emas"
            said = any(
                beside_furniture(m) and not _OF_MATERIALS.match(sentence, m.end())
                for m in _STYLE_IN_PROSE.get(style, words).finditer(sentence)
            )
            if said and style not in held and claim not in problems:
                problems.append(claim)
    return problems


# ── Lights ───────────────────────────────────────────────────────────────────

# kind of light -> (words in the text, plan light types that back it)
_LIGHT_KINDS: dict[str, tuple[re.Pattern[str], frozenset[str]]] = {
    "qandil": (re.compile(r"\bqandil"), frozenset({"chandelier"})),
    "osma chiroq": (re.compile(r"\bosma chiroq"), frozenset({"pendant"})),
    "bra": (re.compile(r"\bbra(?:si|lar|da)?\b"), frozenset({"bra"})),
    "torsher": (re.compile(r"\b(torsher|pol chirog)"), frozenset({"floor_lamp"})),
    "LED": (re.compile(r"\bled\b"), frozenset({"led_panel", "led_linear", "led_track"})),
    "spot": (re.compile(r"\b(spot|downlight)"), frozenset({"spotlight", "ies", "downlight"})),
    "trek": (re.compile(r"\btrek|\bshina(?!m)|\bшинн"), frozenset({"track", "led_track"})),
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
_WORD = re.compile(r"[a-z']{5,}")

# Words that name a material, a colour or a kind of furniture: many pieces share them, so naming one
# proves nothing about a particular piece. A word starting with one of these is never "distinctive".
COMMON_NAME_STEMS: tuple[str, ...] = (
    # materials and finishes
    "yog'och", "naqsh", "marmar", "metall", "shisha", "plastik", "rattan", "bambuk", "mato", "charm", "teri",
    "eman", "yong'oq", "temir", "latun", "baxmal", "velvet", "lofer",
    # colours
    "kulrang", "oltin", "tilla", "sariq", "qora", "qizil", "bordo", "ko'k", "havorang", "yashil", "pushti",
    "binafsha", "jigarrang", "qo'ng'ir", "bej", "krem", "oqish",
    # kinds of furniture
    "stul", "stol", "divan", "sofa", "karavot", "krovat", "kreslo", "shkaf", "tumba", "komod", "gilam", "javon",
    "o'rindiq", "stellaj", "garderob",
)


def _catalog_problems(text: str, plan: Any, catalog_names: list[str]) -> list[str]:
    """A piece of the catalog that the plan did not choose, named in the text. The kinds of furniture
    above are a fixed list; this reads the shop's own names, so a "pufik" or "peshtaxta" is caught too.
    Only a distinctive word counts: 5+ letters, in exactly one name of the catalog, and not a material,
    colour or kind of furniture (COMMON_NAME_STEMS)."""
    chosen = _norm(" ".join(f.get("name", "") for f in plan.furniture))
    chosen_words = set(_WORD.findall(chosen))
    names = {_norm(n) for n in catalog_names}
    in_names: dict[str, int] = {}
    for name in names:
        for word in set(_WORD.findall(name)):
            in_names[word] = in_names.get(word, 0) + 1
    problems: list[str] = []
    for word, count in in_names.items():
        if count != 1 or word in _NAME_FILLER or word in chosen_words or word.startswith(COMMON_NAME_STEMS):
            continue
        if re.search(rf"\b{re.escape(word)}", text):
            problems.append(f"'{word}' aytilgan, lekin rejada yo'q")
    return problems


# A word said twice running ("spot spot", "chiroq chiroqlar"): what is left when an id was put in Uzbek badly.
_REPEAT = re.compile(r"\b(\w[\w']*)\s+\1\b|\bchiro(?:q|g'i)\w*\s+chiro(?:q|g'i)")


def _repeat_problems(text: str) -> list[str]:
    m = _REPEAT.search(text)
    return [f"'{m.group(0)}': so'z takrorlangan"] if m else []


def summary_problems(
    summary: str, plan: Any, catalog_names: list[str] | None = None, piece_styles: dict[str, list[str]] | None = None,
) -> list[str]:
    """What the summary claims that the plan does not hold; empty when it can be trusted. *piece_styles*
    are the catalog styles of the shop's pieces by name; without them a style is not checked."""
    text = _norm(summary)
    return [
        *(_catalog_problems(text, plan, catalog_names) if catalog_names else []),
        *(_style_problems(text, plan, piece_styles) if piece_styles is not None else []),
        *_language_problems(text, plan, catalog_names),
        *_colour_of_things_problems(text, plan),
        *_colour_problems(text, plan),
        *_furniture_problems(text, plan),
        *_light_problems(text, plan),
        *_surface_problems(text, plan),
        *_repeat_problems(text),
    ]


# ── Writing a summary from the plan ──────────────────────────────────────────

def colour_name(hex_color: str) -> str:
    """A plain Uzbek name for a colour, with 'och' (light) or 'to'q' (dark) where it helps."""
    h, l, s = _hls(hex_color)
    if 38 <= h <= 50 and s >= 0.45 and 0.35 <= l <= 0.65:
        return "oltin"
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


def _lab(hex_color: str) -> tuple[float, float, float]:
    digits = hex_color.lstrip("#")
    chans = [int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in chans]
    x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047
    y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def _delta_e(a: str, b: str) -> float:
    return sum((p - q) ** 2 for p, q in zip(_lab(a), _lab(b))) ** 0.5


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
    main_colour = (main or {}).get("base_color" if (main or {}).get("type") == "oboy" else "color")
    if accent and main_colour and _delta_e(accent["color"], main_colour) < 10:
        accent = None  # the same colour as the walls: nothing is set apart
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


def _id_pattern(raw: str) -> str:
    """An id as prose writes it: "floor_lamp", "floor lamp", "floor-lamp"."""
    return r"[ _-]".join(re.escape(part) for part in raw.split("_"))


# A light's name as prose says it: the estimate's "Trek (shina)" has brackets that read badly in a sentence.
_LIGHT_SAID = {**LIGHT_TYPE_NAMES, "track": "Trek chirog'i"}
# Light ids said in Uzbek, the longest first so "led_track" is not read as "led" + "track". The ceiling
# light is left out: "ceiling" in prose is the ceiling itself, a leak the language check catches. So is
# an id that is already a word of its name ("bra", "ies" of "IES spot"): the prose's own spelling stays.
_LIGHT_IDS = sorted(
    (t for t, name in _LIGHT_SAID.items() if t != "ceiling" and t not in name.lower().split()), key=len, reverse=True
)
# "chiroq", "chirog'i", "chiroqlar" (any apostrophe), and "tizimi": the prose already says what the
# name's own last word would, so the name drops it ("pendant chiroq" is "osma chiroq", not "osma chiroq chiroq").
_CHIROQ = r"chiro(?:q|g['’‘ʻʼ`´]i)"
_LIGHT_TAIL = re.compile(rf"\s+{_CHIROQ}$", re.I)
_SAID_AFTER = re.compile(rf"\s+(?:{_CHIROQ}|tizim)", re.I)


def _light_said(name: str, sentence_start: bool, tail_said: bool) -> str:
    """*name* as it reads in the middle of a sentence: lower case but for an acronym (LED, IES), capital
    only to start one, and without its "chiroq" when the prose says it next."""
    if tail_said:
        name = _LIGHT_TAIL.sub("", name)
    said = " ".join(w if len(w) > 1 and w.isupper() else w.lower() for w in name.split())
    return said[0].upper() + said[1:] if sentence_start else said


# The floor types as the studio's own floor menu names them (Parket, Kafel, Laminat, Beton), so the prose
# reads the word the user picks the floor by.
_FLOOR_SAID = {"parquet": "parket", "tile": "kafel", "laminate": "laminat", "concrete": "beton"}


def _starts_sentence(m: re.Match[str]) -> bool:
    before = m.string[: m.start()].rstrip()
    return not before or before[-1] in ".!?"


def _localise(text: str) -> str:
    """The studio's ids the model sometimes copies into its prose, said in Uzbek instead."""
    for raw, uz in {**_LAYING_NAMES, **_FLOOR_SAID}.items():
        def floor_said(m: re.Match[str], uz: str = uz) -> str:
            return uz[0].upper() + uz[1:] if _starts_sentence(m) else uz
        text = re.sub(rf"\b{raw}\b", floor_said, text, flags=re.I)
    for raw in _LIGHT_IDS:
        def said(m: re.Match[str], raw: str = raw) -> str:
            return _light_said(_LIGHT_SAID[raw], _starts_sentence(m), bool(_SAID_AFTER.match(m.string, m.end())))
        text = re.sub(rf"\b{_id_pattern(raw)}\b", said, text, flags=re.I)
    return text


# A sentence ends at ".", "!" or "?" followed by a space: "2.5" and the apostrophes of "ko'k" stay whole.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _uzbek_sentences(text: str, plan: Any, catalog_names: list[str] | None = None) -> str:
    """*text* without the sentences that are not for the user: one in English (the model often ends by
    translating itself) or one that reads the studio's ids. Dropping them costs nothing the plan holds,
    while judging the whole text by them would throw the honest Uzbek away with them."""
    sentences = _SENTENCE_END.split(text.strip())
    return " ".join(s for s in sentences if s and not _language_problems(_norm(s), plan, catalog_names))


def reconcile_summary(
    plan: Any, catalog_names: list[str] | None = None, piece_styles: dict[str, list[str]] | None = None,
) -> list[str]:
    """Make ``plan.summary`` say only what the plan holds. Returns what was wrong with the model's
    wording: empty when it was kept, at most without its English or id-bearing sentences; the problems
    when a false sentence was dropped from it or the whole was written from the plan instead.
    *catalog_names* are the shop's own piece names, *piece_styles* their catalog styles by name."""
    def problems_of(text: str) -> list[str]:
        return summary_problems(text, plan, catalog_names, piece_styles)

    localised = _localise(plan.summary or "")
    uzbek = _uzbek_sentences(localised, plan, catalog_names)
    if len(uzbek.split()) < 2:
        # Nothing, or a lone word ("Iliq."), is left to read: say why the whole text was not kept.
        plan.summary = describe_plan(plan)
        return problems_of(localised) or ["matn bo'sh"]
    problems = problems_of(uzbek)
    if not problems:
        plan.summary = uzbek
        return []
    # Only the sentences that are wrong on their own go. Every check reads the plan, not the other
    # sentences, so one alone is judged as it is in the whole; a claim spread over several (three
    # English words) is caught when what is left is read again, and then nothing of it is kept.
    rest = " ".join(s for s in _SENTENCE_END.split(uzbek) if s and not problems_of(s))
    keep = len(rest.split()) >= 2 and not problems_of(rest)
    plan.summary = rest if keep else describe_plan(plan)
    return problems
