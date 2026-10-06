"""Ustalar: a craftsman can be a user, with an application an admin reviews

Until now an usta was only a catalog row an admin typed in. This links a row to
the user who runs it (``ustalar.owner_user_id``, one profile per user) and gives
it the same moderation ``status`` shops have, so a craftsman can apply from the
app and wait for an admin before the public list shows them.

EXISTING ROWS stay visible: ``status`` defaults to 'approved' and ``is_active``
is untouched, so every craftsman listed today is still listed. A new application
is created pending and inactive; the public list already filters on
``is_active``.

Revision ID: 1786000010
Revises: 1786000009
Create Date: 2026-10-06 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000010"
down_revision: Union[str, None] = "1786000009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = "'pending', 'approved', 'rejected'"


def upgrade() -> None:
    op.add_column(
        "ustalar",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_unique_constraint("uq_ustalar_owner_user_id", "ustalar", ["owner_user_id"])
    op.add_column("ustalar", sa.Column("status", sa.String(20), nullable=False, server_default="approved"))
    op.add_column("ustalar", sa.Column("moderation_note", sa.String(300), nullable=True))
    op.create_check_constraint("ck_ustalar_status", "ustalar", f"status IN ({_STATUSES})")
    op.create_index("ix_ustalar_status", "ustalar", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ustalar_status", table_name="ustalar")
    op.drop_constraint("ck_ustalar_status", "ustalar", type_="check")
    op.drop_column("ustalar", "moderation_note")
    op.drop_column("ustalar", "status")
    op.drop_constraint("uq_ustalar_owner_user_id", "ustalar", type_="unique")
    op.drop_column("ustalar", "owner_user_id")
