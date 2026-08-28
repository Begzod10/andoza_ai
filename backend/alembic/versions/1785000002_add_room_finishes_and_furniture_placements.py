"""Add room_finishes and room_furniture_placements tables

These tables replace the legacy RoomDecoration JSONB blobs for finishes and
furniture placements, enabling per-item CRUD operations and consistent delta
calculations.

Revision ID: 1785000002
Revises: 1785000001
Create Date: 2026-07-28 16:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '1785000002'
down_revision = '1785000001'
branch_labels = None
depends_on = None

FINISH_SURFACE_VALUES = ("wall_a", "wall_b", "wall_c", "wall_d", "floor", "ceiling")
FINISH_TYPE_VALUES = ("paint", "wallpaper", "tile", "laminate", "wood", "other")


def upgrade() -> None:
    """Create room_finishes and room_furniture_placements tables."""

    # ------------------------------------------------------------------
    # room_finishes — itemized surface finish selections
    # ------------------------------------------------------------------
    op.create_table(
        "room_finishes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("surface", sa.String(length=10), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("finish_type", sa.String(length=20), nullable=True),
        sa.Column("color_hex", sa.String(length=7), nullable=True),
        sa.Column("wall_index", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "surface IN ({})".format(
                ",".join(f"'{v}'" for v in FINISH_SURFACE_VALUES)
            ),
            name="ck_room_finishes_surface",
        ),
        sa.CheckConstraint(
            "finish_type IS NULL OR finish_type IN ({})".format(
                ",".join(f"'{v}'" for v in FINISH_TYPE_VALUES)
            ),
            name="ck_room_finishes_finish_type",
        ),
        sa.CheckConstraint("wall_index IS NULL OR (wall_index >= 0 AND wall_index <= 3)",
                          name="ck_room_finishes_wall_index"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_room_finishes_room_id", "room_finishes", ["room_id"])
    op.create_index("ix_room_finishes_material_id", "room_finishes", ["material_id"])

    # ------------------------------------------------------------------
    # room_furniture_placements — itemized furniture in room
    # ------------------------------------------------------------------
    op.create_table(
        "room_furniture_placements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("furniture_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("x", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("y", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("rotation", sa.Numeric(precision=6, scale=2), nullable=False, server_default="0"),
        sa.Column("z_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("x >= 0 AND y >= 0", name="ck_room_furniture_placements_position"),
        sa.CheckConstraint("rotation >= 0 AND rotation <= 360", name="ck_room_furniture_placements_rotation"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["furniture_id"], ["furniture.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_room_furniture_placements_room_id", "room_furniture_placements", ["room_id"])
    op.create_index("ix_room_furniture_placements_furniture_id", "room_furniture_placements", ["furniture_id"])


def downgrade() -> None:
    """Drop room_finishes and room_furniture_placements tables."""

    op.drop_table("room_furniture_placements")
    op.drop_table("room_finishes")
