"""stores.is_demo (presentation stores) and seed_markers (what a seed must not redo)

stores.is_demo marks the stores app/seed_demo_stores.py seeds from public data; it
replaces a "DEMO:" prefix in moderation_note, which approving a store wipes.
seed_markers holds "demo_stores_removed" after `--remove`, so the next deploy does not
seed the demo again.

Revision ID: 1786000041
Revises: 1786000040
Create Date: 2026-10-24 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000041"
down_revision: Union[str, None] = "1786000040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stores",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "seed_markers",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("seed_markers")
    op.drop_column("stores", "is_demo")
