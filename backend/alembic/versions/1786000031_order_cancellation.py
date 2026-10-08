"""Orders can be cancelled: a new status, who cancelled and why

Revision ID: 1786000031
Revises: 1786000030
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000031"
down_revision: Union[str, None] = "1786000030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A new enum value cannot be added inside a transaction block on every Postgres version.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled'")
    op.add_column("orders", sa.Column("cancelled_by", sa.String(10), nullable=True))
    op.add_column("orders", sa.Column("cancel_reason", sa.String(300), nullable=True))
    op.create_check_constraint(
        "ck_orders_cancelled_by", "orders", "cancelled_by IS NULL OR cancelled_by IN ('buyer', 'seller', 'admin')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_orders_cancelled_by", "orders", type_="check")
    op.drop_column("orders", "cancel_reason")
    op.drop_column("orders", "cancelled_by")
    # Postgres cannot drop a value from an enum type. 'cancelled' stays in order_status, unused;
    # any cancelled orders are moved back to 'accepted' so the older code can read them.
    op.execute("UPDATE orders SET status = 'accepted' WHERE status = 'cancelled'")
