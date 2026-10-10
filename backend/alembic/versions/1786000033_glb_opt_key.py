"""3D models: a compressed copy of each GLB, served in place of the original

Revision ID: 1786000033
Revises: 1786000032
Create Date: 2026-10-10 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000033"
down_revision: Union[str, None] = "1786000032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: a model without a copy (yet, or because compressing did not help) serves its original.
    op.add_column("furniture", sa.Column("glb_opt_key", sa.String(255), nullable=True))
    op.add_column("user_models", sa.Column("opt_key", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_models", "opt_key")
    op.drop_column("furniture", "glb_opt_key")
