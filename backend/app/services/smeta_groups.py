"""The estimate's lines, grouped for reading — the same seven groups the web page shows.

The engine tags every line with a fine-grained ``category`` ("suvoq", "grunt", "boyoq", ...).
Thirteen headings is too many for a bill, so they are folded into seven that follow the order work
is done in: prepare the walls, finish them, floor, ceiling, electrics, furniture, and a catch-all for
anything unknown. ``frontend/src/lib/smetaGroups.ts`` carries the same table; change both together
(``tests/test_smeta_groups.py`` pins the backend's side to every category the engine can emit).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.services.smeta import ComputedLine

GROUP_ORDER = ("tayyorlash", "pardoz", "pol", "shift", "elektr", "jihoz", "boshqa")

GROUP_LABEL = {
    "tayyorlash": "Devorni tayyorlash",
    "pardoz": "Devor pardozi",
    "pol": "Pol va plintus",
    "shift": "Shift",
    "elektr": "Elektr va yoritish",
    "jihoz": "Mebel va jihozlar",
    "boshqa": "Boshqa xarajatlar",
}

# The same colours as the web page's cost bar.
GROUP_COLOUR = {
    "tayyorlash": "#7C8DB5",
    "pardoz": "#2F55D4",
    "pol": "#F59E0B",
    "shift": "#14B8A6",
    "elektr": "#8B5CF6",
    "jihoz": "#10B981",
    "boshqa": "#94A3B8",
}

CATEGORY_TO_GROUP = {
    "suvoq": "tayyorlash",
    "grunt": "tayyorlash",
    "shpatlyovka": "tayyorlash",
    "boyoq": "pardoz",
    "oboy": "pardoz",
    "texture": "pardoz",
    "laminat": "pol",
    "plitka": "pol",
    "plintus": "pol",
    "shift": "shift",
    "elektr": "elektr",
    "chiroq": "elektr",
    "jihoz": "jihoz",
}


def group_key_for(category: str | None) -> str:
    return CATEGORY_TO_GROUP.get((category or "").strip().lower(), "boshqa")


@dataclass
class LineGroup:
    key: str
    lines: list[ComputedLine] = field(default_factory=list)

    @property
    def label(self) -> str:
        return GROUP_LABEL[self.key]

    @property
    def subtotal(self) -> int:
        return sum(line.subtotal_uzs for line in self.lines)


def group_lines(lines: list[ComputedLine]) -> list[LineGroup]:
    """Groups in GROUP_ORDER, empty ones left out, lines in their original order inside a group."""
    buckets: dict[str, LineGroup] = {}
    for line in lines:
        key = group_key_for(line.category)
        buckets.setdefault(key, LineGroup(key)).lines.append(line)
    return [buckets[key] for key in GROUP_ORDER if key in buckets]


def share(subtotal: int, grand_total: int) -> float:
    """0..1; 0 when there is nothing to divide."""
    return subtotal / grand_total if grand_total > 0 else 0.0


def format_share(fraction: float) -> str:
    """'37%', or '<1%' for a sliver that rounds to nothing but is not nothing."""
    if 0 < fraction < 0.01:
        return "<1%"
    return f"{round(fraction * 100)}%"
