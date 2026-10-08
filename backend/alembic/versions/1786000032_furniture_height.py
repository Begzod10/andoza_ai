"""Furniture: the model's height, so a tall piece is not put in front of a window

Revision ID: 1786000032
Revises: 1786000031
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000032"
down_revision: Union[str, None] = "1786000031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: every model uploaded so far has none, and the layout falls back on its kind.
    op.add_column("furniture", sa.Column("height_cm", sa.Numeric(6, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("furniture", "height_cm")
