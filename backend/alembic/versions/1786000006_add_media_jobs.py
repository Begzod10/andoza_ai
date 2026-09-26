"""Add media_jobs table

Fixes an IDOR on ``GET /jobs/{job_id}``: the endpoint only checked that the
caller was *some* authenticated user, never that the job belonged to them,
so any logged-in user who learned/guessed another user's Celery task id
could poll their photo-processing status and result. ``media_jobs`` records
who owns each task id at enqueue time so the endpoint can check ownership.

Revision ID: 1786000006
Revises: 1786000005
Create Date: 2026-09-21 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1786000006"
down_revision: Union[str, None] = "1786000005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    if "media_jobs" not in existing:
        op.create_table(
            "media_jobs",
            sa.Column("id", sa.String(length=64), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_media_jobs_user_id", "media_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_media_jobs_user_id", table_name="media_jobs", if_exists=True)
    op.drop_table("media_jobs")
