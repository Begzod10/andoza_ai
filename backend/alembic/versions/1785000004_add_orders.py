"""Add orders and order_lines tables

The mobile Orders tab lets a user place a shop order with one or more line
items. `orders` holds the header (dealer, total, status); `order_lines` holds
the individual products. material_id is a soft reference only (no FK) so orders
referencing mock/products still insert cleanly.

Revision ID: 1785000004
Revises: 1785000003
Create Date: 2026-08-20 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1785000004"
down_revision: Union[str, None] = "1785000003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ORDER_STATUS = postgresql.ENUM(
    "accepted", "gathering", "on_the_way", "delivered",
    name="order_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    ORDER_STATUS.create(bind, checkfirst=True)

    if "orders" not in existing:
        op.create_table(
            "orders",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("dealer_name", sa.String(200), nullable=False),
            sa.Column("total_uzs", sa.BigInteger(), nullable=False),
            sa.Column("status", ORDER_STATUS, nullable=False),
            sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_orders_id", "orders", ["id"])
        op.create_index("ix_orders_user_id", "orders", ["user_id"])

    if "order_lines" not in existing:
        op.create_table(
            "order_lines",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("product_name", sa.String(200), nullable=False),
            sa.Column("unit", sa.String(50), nullable=False),
            sa.Column("unit_price_uzs", sa.BigInteger(), nullable=False),
            sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        )
        op.create_index("ix_order_lines_id", "order_lines", ["id"])
        op.create_index("ix_order_lines_order_id", "order_lines", ["order_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_table("order_lines")
    op.drop_table("orders")
    ORDER_STATUS.drop(bind, checkfirst=True)
