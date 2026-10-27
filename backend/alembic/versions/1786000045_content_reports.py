"""content_reports: users report objectionable ustalar, products, portfolios

Revision ID: 1786000045
Revises: 1786000044
Create Date: 2026-10-27 00:00:01.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000045"
down_revision: Union[str, None] = "1786000044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "reporter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("target_type", sa.String(20), nullable=False),
        # A string, not a FK: targets live in several tables (and some ids
        # are not UUIDs).
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_content_reports_reporter_target"),
        sa.CheckConstraint("status IN ('open','resolved','dismissed')", name="ck_content_reports_status"),
    )
    # The admin queue lists by status, newest first.
    op.create_index("ix_content_reports_status_created", "content_reports", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_content_reports_status_created", table_name="content_reports")
    op.drop_table("content_reports")
