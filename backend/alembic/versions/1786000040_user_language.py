"""users.language: interface language the person chose (uz / ru / en)

Revision ID: 1786000040
Revises: 1786000039
Create Date: 2026-10-23 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000040"
down_revision: Union[str, None] = "1786000039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("language", sa.String(5), nullable=False, server_default="uz"),
    )
    op.create_check_constraint(
        "ck_users_language", "users", "language IN ('uz','ru','en')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_language", "users", type_="check")
    op.drop_column("users", "language")
