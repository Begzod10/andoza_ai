"""Users: Google account id and email, for "Sign in with Google"

Revision ID: 1786000034
Revises: 1786000033
Create Date: 2026-10-11 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000034"
down_revision: Union[str, None] = "1786000033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both nullable: every existing account is a phone or username/password one.
    op.add_column("users", sa.Column("google_sub", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    # Unique: one Google account maps to exactly one user.
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "email")
    op.drop_column("users", "google_sub")
