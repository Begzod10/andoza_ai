"""Orders: delivery address, phone and payment method

Revision ID: 1786000021
Revises: 1786000020
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000021"
down_revision: Union[str, None] = "1786000020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All nullable: existing orders have none of these, and so may new ones.
    op.add_column("orders", sa.Column("delivery_address", sa.String(500), nullable=True))
    op.add_column("orders", sa.Column("phone", sa.String(50), nullable=True))
    op.add_column("orders", sa.Column("payment_method", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_orders_payment_method",
        "orders",
        "payment_method IS NULL OR payment_method IN ('cash', 'card')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_orders_payment_method", "orders", type_="check")
    op.drop_column("orders", "payment_method")
    op.drop_column("orders", "phone")
    op.drop_column("orders", "delivery_address")
