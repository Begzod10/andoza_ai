"""Sellers: shop ownership and moderation status for shops and 3D models

A seller is a user who owns a shop. This adds ``stores.owner_user_id`` (one shop
per user), and a moderation ``status`` on both stores and furniture, so a shop
application and each uploaded model wait for an admin before the public catalog
shows them.

EXISTING ROWS stay visible: ``status`` defaults to 'approved' and nothing about
``is_active`` changes, so every shop and model that is live today is still live.
New seller content is created pending and inactive; the public queries already
filter on ``is_active``.

Revision ID: 1786000008
Revises: 1786000007
Create Date: 2026-10-01 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000008"
down_revision: Union[str, None] = "1786000007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = "'pending', 'approved', 'rejected'"


def upgrade() -> None:
    op.add_column(
        "stores",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_unique_constraint("uq_stores_owner_user_id", "stores", ["owner_user_id"])
    op.add_column("stores", sa.Column("status", sa.String(20), nullable=False, server_default="approved"))
    op.add_column("stores", sa.Column("moderation_note", sa.String(300), nullable=True))
    op.create_check_constraint("ck_stores_status", "stores", f"status IN ({_STATUSES})")

    op.add_column("furniture", sa.Column("status", sa.String(20), nullable=False, server_default="approved"))
    op.add_column("furniture", sa.Column("moderation_note", sa.String(300), nullable=True))
    op.create_check_constraint("ck_furniture_status", "furniture", f"status IN ({_STATUSES})")
    op.create_index("ix_furniture_status", "furniture", ["status"])


def downgrade() -> None:
    op.drop_index("ix_furniture_status", table_name="furniture")
    op.drop_constraint("ck_furniture_status", "furniture", type_="check")
    op.drop_column("furniture", "moderation_note")
    op.drop_column("furniture", "status")

    op.drop_constraint("ck_stores_status", "stores", type_="check")
    op.drop_column("stores", "moderation_note")
    op.drop_column("stores", "status")
    op.drop_constraint("uq_stores_owner_user_id", "stores", type_="unique")
    op.drop_column("stores", "owner_user_id")
