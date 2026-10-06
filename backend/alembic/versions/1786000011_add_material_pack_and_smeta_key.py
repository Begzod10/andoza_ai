"""Materials: the size of one pack, and which smeta line a product prices

A shop sells "Suvoq, 1 qop, 65 000 so'm"; the estimate needs kilograms (a wall takes
8.5 kg/m²), so it has to know what is in the bag. ``pack_qty`` + ``pack_unit`` say so
("30" "kg", "2.5" "m", "3" "m2"). ``smeta_key`` says which line of the estimate the
product is the shop price for ("suvoq", "grunt", "plintus", "kabel", "light:pendant"...),
so the engine can price the line from the catalog instead of a constant in the code.

All three are nullable: a product with none of them behaves exactly as before.

Revision ID: 1786000011
Revises: 1786000010
Create Date: 2026-10-05 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000011"
down_revision: Union[str, None] = "1786000010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("materials", sa.Column("pack_qty", sa.Numeric(10, 3), nullable=True))
    op.add_column("materials", sa.Column("pack_unit", sa.String(10), nullable=True))
    op.add_column("materials", sa.Column("smeta_key", sa.String(40), nullable=True))
    op.create_index("ix_materials_smeta_key", "materials", ["smeta_key"])
    op.create_check_constraint(
        "ck_materials_pack_unit",
        "materials",
        "pack_unit IS NULL OR pack_unit IN ('kg', 'litr', 'm', 'm2', 'dona')",
    )
    op.create_check_constraint(
        "ck_materials_pack_pair",
        "materials",
        "(pack_qty IS NULL) = (pack_unit IS NULL) AND (pack_qty IS NULL OR pack_qty > 0)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_materials_pack_pair", "materials", type_="check")
    op.drop_constraint("ck_materials_pack_unit", "materials", type_="check")
    op.drop_index("ix_materials_smeta_key", table_name="materials")
    op.drop_column("materials", "smeta_key")
    op.drop_column("materials", "pack_unit")
    op.drop_column("materials", "pack_qty")
