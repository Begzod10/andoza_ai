"""Room type (rooms.room_type): the allowed ids and the name -> type guess.

The guess is the back-fill table of migration 1786000042 and of the frontend's
`guessRoomType`; the three must agree. Rules are tried in order, first match wins
("Bolalar yotoqxonasi" is `bolalar`, not `yotoqxona`).
"""
from __future__ import annotations

ROOM_TYPES: tuple[str, ...] = (
    "mehmonxona", "yotoqxona", "bolalar", "oshxona", "kabinet", "hammom", "balkon",
)

# (type, case-insensitive substrings), in priority order.
GUESS_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("bolalar", ("bolalar", "детск")),
    ("yotoqxona", ("yotoq", "спальн")),
    ("oshxona", ("oshxona", "кухн")),
    ("kabinet", ("kabinet", "ish xona", "кабинет")),
    ("hammom", ("hammom", "vanna", "ванн", "санузел")),
    ("balkon", ("balkon", "балкон")),
    ("mehmonxona", ("mehmon", "zal", "гостин")),
)


def guess_room_type(name: str) -> str | None:
    low = (name or "").lower()
    for room_type, needles in GUESS_RULES:
        if any(n in low for n in needles):
            return room_type
    return None
