"""Order lines: remember which catalog furniture piece a line was for

Revision ID: 1786000022
Revises: 1786000021
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000022"
down_revision: Union[str, None] = "1786000021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Soft reference, like material_id: no FK, so deleting a catalog piece never
    # breaks the history of orders that included it.
    op.add_column("order_lines", sa.Column("furniture_id", postgresql.UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column("order_lines", "furniture_id")
