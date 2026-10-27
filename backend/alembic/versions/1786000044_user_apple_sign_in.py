"""Users: Apple account id, for "Sign in with Apple"

Revision ID: 1786000044
Revises: 1786000043
Create Date: 2026-10-27 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000044"
down_revision: Union[str, None] = "1786000043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: no existing account signed in with Apple. users.email already
    # exists (added for Google sign-in).
    op.add_column("users", sa.Column("apple_sub", sa.String(255), nullable=True))
    # Unique: one Apple account maps to exactly one user.
    op.create_index("ix_users_apple_sub", "users", ["apple_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_apple_sub", table_name="users")
    op.drop_column("users", "apple_sub")
