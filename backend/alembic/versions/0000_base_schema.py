"""Base schema — create all tables on a fresh database.

Historically the "initial" migration (7edc8d1c1fda) only ALTERed tables that
were assumed to already exist, so `alembic upgrade head` failed on an empty
database. This migration creates the schema as it was *before* that revision
(norms without `params`, rooms without `deleted`); the later revisions then
apply cleanly on top.

It is idempotent: tables that already exist (e.g. created by _init_db.py on
a database that was never stamped) are skipped.

Revision ID: base_schema
Revises:
Create Date: 2026-07-25 22:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "base_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MATERIAL_CATEGORY = postgresql.ENUM(
    "boyoq", "oboy", "dekorativ", "laminat", "parket", "plitka",
    "eshik", "deraza", "gips", "sement", "santexnika", "elektr_mat",
    name="material_category",
    create_type=False,
)
MATERIAL_UNIT = postgresql.ENUM(
    "litr", "rulon", "m2", "qop", "dona", "m", "komplekt",
    name="material_unit",
    create_type=False,
)
USTA_CATEGORY = postgresql.ENUM(
    "elektrik", "santexnik", "malyar", "oboy", "laminat", "brigada",
    name="usta_category",
    create_type=False,
)
LEAD_STATUS = postgresql.ENUM(
    "new", "viewed", "contacted", "closed",
    name="lead_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    MATERIAL_CATEGORY.create(bind, checkfirst=True)
    MATERIAL_UNIT.create(bind, checkfirst=True)
    USTA_CATEGORY.create(bind, checkfirst=True)
    LEAD_STATUS.create(bind, checkfirst=True)

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("phone", sa.String(20)),
            sa.Column("username", sa.String(50)),
            sa.Column("password_hash", sa.String(255)),
            sa.Column("name", sa.String(100)),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_users_phone", "users", ["phone"], unique=True)
        op.create_index("ix_users_username", "users", ["username"], unique=True)
        op.create_index("ix_users_id", "users", ["id"])

    if "stores" not in existing:
        op.create_table(
            "stores",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("district", sa.String(100)),
            sa.Column("phone", sa.String(20)),
            sa.Column("telegram", sa.String(100)),
            sa.Column("logo_color", sa.String(7)),
            sa.Column("partner_tier", sa.String(20), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_stores_id", "stores", ["id"])

    if "norms" not in existing:
        op.create_table(
            "norms",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("material_key", sa.String(50), nullable=False),
            sa.Column("coverage_per_unit", sa.Numeric(10, 4), nullable=False),
            sa.Column("coats", sa.Integer(), nullable=False),
            sa.Column("waste_factor", sa.Numeric(4, 3), nullable=False),
            sa.Column("notes", sa.Text()),
        )
        op.create_index("ix_norms_material_key", "norms", ["material_key"], unique=True)

    if "ustalar" not in existing:
        op.create_table(
            "ustalar",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("category", USTA_CATEGORY, nullable=False),
            sa.Column("district", sa.String(100)),
            sa.Column("phone", sa.String(20), nullable=False),
            sa.Column("telegram", sa.String(100)),
            sa.Column("rating", sa.Numeric(3, 2), nullable=False),
            sa.Column("jobs_count", sa.Integer(), nullable=False),
            sa.Column("price_min", sa.BigInteger()),
            sa.Column("price_max", sa.BigInteger()),
            sa.Column("verified", sa.Boolean(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_ustalar_district", "ustalar", ["district"])
        op.create_index("ix_ustalar_id", "ustalar", ["id"])
        op.create_index("ix_ustalar_category", "ustalar", ["category"])

    if "draft_rooms" not in existing:
        op.create_table(
            "draft_rooms",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("state", postgresql.JSONB(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_draft_rooms_id", "draft_rooms", ["id"])

    if "apartments" not in existing:
        op.create_table(
            "apartments",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("address", sa.String(500)),
            sa.Column("developer", sa.String(200)),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_apartments_id", "apartments", ["id"])
        op.create_index("ix_apartments_user_id", "apartments", ["user_id"])

    if "materials" not in existing:
        op.create_table(
            "materials",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", MATERIAL_CATEGORY, nullable=False),
            sa.Column("name_uz", sa.String(200), nullable=False),
            sa.Column("unit", MATERIAL_UNIT, nullable=False),
            sa.Column("price_uzs", sa.BigInteger(), nullable=False),
            sa.Column("color_hex", sa.String(7)),
            sa.Column("texture_key", sa.String(200)),
            sa.Column("pbr_roughness", sa.Numeric(3, 2), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_materials_id", "materials", ["id"])
        op.create_index("ix_materials_store_id", "materials", ["store_id"])

    if "furniture" not in existing:
        op.create_table(
            "furniture",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id", ondelete="SET NULL")),
            sa.Column("category", sa.String(50), nullable=False),
            sa.Column("name_uz", sa.String(200), nullable=False),
            sa.Column("price_uzs", sa.BigInteger()),
            sa.Column("glb_key", sa.String(200)),
            sa.Column("footprint_w", sa.Numeric(5, 2)),
            sa.Column("footprint_d", sa.Numeric(5, 2)),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_furniture_id", "furniture", ["id"])
        op.create_index("ix_furniture_category", "furniture", ["category"])
        op.create_index("ix_furniture_store_id", "furniture", ["store_id"])

    if "rooms" not in existing:
        op.create_table(
            "rooms",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("apartment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("ceiling_h", sa.Numeric(4, 2)),
            sa.Column("geometry", postgresql.JSONB()),
            sa.Column("surfaces", postgresql.JSONB()),
            sa.Column("furniture_layout", postgresql.JSONB()),
            sa.Column("state", postgresql.JSONB()),
            sa.Column("floor_area", sa.Numeric(8, 2)),
            sa.Column("net_wall_area", sa.Numeric(8, 2)),
            sa.Column("perimeter", sa.Numeric(8, 2)),
            sa.Column("openings_count", sa.Integer(), nullable=False),
            sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_rooms_id", "rooms", ["id"])
        op.create_index("ix_rooms_apartment_id", "rooms", ["apartment_id"])

    if "leads" not in existing:
        op.create_table(
            "leads",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("usta_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ustalar.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("room_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rooms.id", ondelete="SET NULL")),
            sa.Column("smeta_snapshot", postgresql.JSONB()),
            sa.Column("status", LEAD_STATUS, nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_leads_id", "leads", ["id"])
        op.create_index("ix_leads_user_id", "leads", ["user_id"])
        op.create_index("ix_leads_usta_id", "leads", ["usta_id"])
        op.create_index("ix_leads_room_id", "leads", ["room_id"])
        op.create_index("ix_leads_status", "leads", ["status"])

    if "estimates" not in existing:
        op.create_table(
            "estimates",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("room_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lines", postgresql.JSONB(), nullable=False),
            sa.Column("total_uzs", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_estimates_room_id", "estimates", ["room_id"])
        op.create_index("ix_estimates_id", "estimates", ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    for table in (
        "estimates", "leads", "rooms", "furniture", "materials",
        "apartments", "draft_rooms", "ustalar", "norms", "stores", "users",
    ):
        op.drop_table(table)
    LEAD_STATUS.drop(bind, checkfirst=True)
    USTA_CATEGORY.drop(bind, checkfirst=True)
    MATERIAL_UNIT.drop(bind, checkfirst=True)
    MATERIAL_CATEGORY.drop(bind, checkfirst=True)
