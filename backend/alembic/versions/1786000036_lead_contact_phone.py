"""leads.contact_phone: the phone a client types on an usta request

Revision ID: 1786000036
Revises: 1786000035
Create Date: 2026-10-12 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000036"
down_revision: Union[str, None] = "1786000035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column(
            "contact_phone",
            sa.String(20),
            nullable=True,
            comment="Phone the client typed on the request (+998XXXXXXXXX)",
        ),
    )


def downgrade() -> None:
    op.drop_column("leads", "contact_phone")
