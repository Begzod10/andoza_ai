"""Let a room finish target any wall the room actually has

``room_finishes.surface`` was a VARCHAR(10) pinned by a CHECK constraint to
the 4-wall rectangle ``wall_a``..``wall_d`` (+ ``floor``/``ceiling``), with a
companion CHECK capping ``wall_index`` at 3. A LiDAR-scanned room is an N-wall
polygon whose ``geometry.walls[].id`` values are ``"0"``, ``"1"``, … — so its
5th wall could never be given a finish, and was never costed in the smeta.

This widens the column to VARCHAR(64) and relaxes both CHECKs so a finish may
also name the room's own wall id. It is additive: every existing row keeps its
exact value (``wall_a`` is still ``wall_a``) and still passes the new CHECK,
which only requires a non-empty surface.

Reversibility: downgrade restores the original VARCHAR(10) column and both
original CHECKs. Rows the old schema cannot represent — a surface outside the
six legacy values, or a wall_index above 3 — are deleted first, because there
is no value they could be narrowed to. Such rows can only have been created
after this migration ran, so a downgrade of a database that never used the
feature loses nothing.

Revision ID: 1786000002
Revises: 6b1db815b91a
Create Date: 2026-09-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1786000002'
down_revision = '6b1db815b91a'
branch_labels = None
depends_on = None

LEGACY_SURFACE_VALUES = ("wall_a", "wall_b", "wall_c", "wall_d", "floor", "ceiling")
_LEGACY_SQL_LIST = ",".join(f"'{v}'" for v in LEGACY_SURFACE_VALUES)


def upgrade() -> None:
    op.drop_constraint("ck_room_finishes_surface", "room_finishes", type_="check")
    op.drop_constraint("ck_room_finishes_wall_index", "room_finishes", type_="check")

    op.alter_column(
        "room_finishes",
        "surface",
        existing_type=sa.String(length=10),
        type_=sa.String(length=64),
        existing_nullable=False,
        comment=(
            "Surface identifier: 'floor', 'ceiling', a legacy 'wall_a'..'wall_d' "
            "alias, or the room's own geometry.walls[].id (e.g. '0'..'4')"
        ),
    )

    # 'floor' and 'ceiling' stay reserved: a wall id may not shadow them.
    # Anything else non-empty is allowed here and validated against the
    # room's real geometry in the API layer, which is the only place that
    # knows which wall ids a given room has.
    op.create_check_constraint(
        "ck_room_finishes_surface",
        "room_finishes",
        "length(btrim(surface)) > 0",
    )
    op.create_check_constraint(
        "ck_room_finishes_wall_index",
        "room_finishes",
        "wall_index IS NULL OR wall_index >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_room_finishes_surface", "room_finishes", type_="check")
    op.drop_constraint("ck_room_finishes_wall_index", "room_finishes", type_="check")

    # Drop what the narrow schema cannot hold (see module docstring).
    op.execute(
        sa.text(
            "DELETE FROM room_finishes WHERE surface NOT IN ({}) "
            "OR wall_index > 3".format(_LEGACY_SQL_LIST)
        )
    )

    op.alter_column(
        "room_finishes",
        "surface",
        existing_type=sa.String(length=64),
        type_=sa.String(length=10),
        existing_nullable=False,
        comment="Surface identifier (wall_a, floor, etc.)",
    )

    op.create_check_constraint(
        "ck_room_finishes_surface",
        "room_finishes",
        "surface IN ({})".format(_LEGACY_SQL_LIST),
    )
    op.create_check_constraint(
        "ck_room_finishes_wall_index",
        "room_finishes",
        "wall_index IS NULL OR (wall_index >= 0 AND wall_index <= 3)",
    )
