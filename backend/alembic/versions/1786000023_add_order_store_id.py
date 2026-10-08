"""Orders: the shop that fulfils each one

Revision ID: 1786000023
Revises: 1786000022
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000023"
down_revision: Union[str, None] = "1786000022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: orders placed before this have no recorded shop, and an order of
    # shop-less catalogue items never will. Deleting a shop keeps its history.
    op.add_column(
        "orders",
        sa.Column("store_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stores.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_orders_store_id", "orders", ["store_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_store_id", table_name="orders")
    op.drop_column("orders", "store_id")
