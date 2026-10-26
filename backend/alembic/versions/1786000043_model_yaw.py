"""furniture.model_yaw: degrees the studio turns a GLB so its front faces the room

footprint_w/d are stored after this turn. Existing rows keep 0, i.e. today's look.

Revision ID: 1786000043
Revises: 1786000042
Create Date: 2026-10-26 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000043"
down_revision: Union[str, None] = "1786000042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "furniture",
        sa.Column("model_yaw", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint("ck_furniture_model_yaw", "furniture", "model_yaw IN (0, 90, 180, 270)")


def downgrade() -> None:
    op.drop_constraint("ck_furniture_model_yaw", "furniture", type_="check")
    op.drop_column("furniture", "model_yaw")
