"""Shop inquiries: a customer asks a shop about a product

Revision ID: 1786000020
Revises: 1786000011
Create Date: 2026-10-06 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000020"
down_revision: Union[str, None] = "1786000011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = "'new', 'viewed', 'contacted', 'closed'"


def upgrade() -> None:
    op.create_table(
        "shop_inquiries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("furniture_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("furniture.id", ondelete="SET NULL"), nullable=True),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(f"status IN ({_STATUSES})", name="ck_shop_inquiries_status"),
    )
    op.create_index("ix_shop_inquiries_store_id", "shop_inquiries", ["store_id"])
    op.create_index("ix_shop_inquiries_user_id", "shop_inquiries", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_shop_inquiries_user_id", table_name="shop_inquiries")
    op.drop_index("ix_shop_inquiries_store_id", table_name="shop_inquiries")
    op.drop_table("shop_inquiries")
