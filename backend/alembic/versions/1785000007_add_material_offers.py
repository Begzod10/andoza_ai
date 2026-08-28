"""Add material_offers table

The same material can be offered by several stores at different prices, which
powers the mobile Do'kon dealer-comparison view. Each row is one store's offer
(price / stock / delivery) for a material, unique per (material_id, store_id).

Revision ID: 1785000007
Revises: 1785000006
Create Date: 2026-08-20 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1785000007"
down_revision: Union[str, None] = "1785000006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    if "material_offers" not in existing:
        op.create_table(
            "material_offers",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "material_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("materials.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "store_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("stores.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("price_uzs", sa.BigInteger(), nullable=False),
            sa.Column(
                "in_stock",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column(
                "delivery_days",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.UniqueConstraint("material_id", "store_id", name="uq_material_offer"),
        )
        op.create_index("ix_material_offers_id", "material_offers", ["id"])
        op.create_index(
            "ix_material_offers_material_id", "material_offers", ["material_id"]
        )
        op.create_index(
            "ix_material_offers_store_id", "material_offers", ["store_id"]
        )


def downgrade() -> None:
    op.drop_table("material_offers")
