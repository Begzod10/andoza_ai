"""furniture.styles: the design styles a model suits (empty = every style)

Revision ID: 1786000038
Revises: 1786000037
Create Date: 2026-10-19 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000038"
down_revision: Union[str, None] = "1786000037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "furniture",
        sa.Column("styles", postgresql.ARRAY(sa.String(20)), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("furniture", "styles")
