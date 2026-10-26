"""rooms.room_type: the kind of room, back-filled from its name

Back-fill only touches rows whose type is still NULL; the first matching rule wins
(rules are applied in this order and each only sees rows no earlier rule set).
Mirrors app/services/room_type.py and the frontend's guessRoomType.

Revision ID: 1786000042
Revises: 1786000041
Create Date: 2026-10-26 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000042"
down_revision: Union[str, None] = "1786000041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TYPES = ("mehmonxona", "yotoqxona", "bolalar", "oshxona", "kabinet", "hammom", "balkon")

# Frozen copy of the back-fill table (type, name substrings), in priority order.
_RULES = (
    ("bolalar", ("bolalar", "детск")),
    ("yotoqxona", ("yotoq", "спальн")),
    ("oshxona", ("oshxona", "кухн")),
    ("kabinet", ("kabinet", "ish xona", "кабинет")),
    ("hammom", ("hammom", "vanna", "ванн", "санузел")),
    ("balkon", ("balkon", "балкон")),
    ("mehmonxona", ("mehmon", "zal", "гостин")),
)


def backfill_statements() -> list[str]:
    """One UPDATE per rule, in order. lower() on both sides keeps Cyrillic
    matching independent of the database's locale."""
    out = []
    for room_type, needles in _RULES:
        patterns = ", ".join("'%" + n.lower().replace("'", "''") + "%'" for n in needles)
        out.append(
            f"UPDATE rooms SET room_type = '{room_type}' "
            f"WHERE room_type IS NULL AND lower(name) LIKE ANY(ARRAY[{patterns}])"
        )
    return out


def upgrade() -> None:
    op.add_column("rooms", sa.Column("room_type", sa.String(20), nullable=True))
    allowed = ", ".join(f"'{t}'" for t in _TYPES)
    op.create_check_constraint("ck_rooms_room_type", "rooms", f"room_type IN ({allowed})")
    for stmt in backfill_statements():
        op.execute(stmt)


def downgrade() -> None:
    op.drop_constraint("ck_rooms_room_type", "rooms", type_="check")
    op.drop_column("rooms", "room_type")
