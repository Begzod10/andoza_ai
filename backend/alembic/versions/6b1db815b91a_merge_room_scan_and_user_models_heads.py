"""merge room_scan and user_models heads

Revision ID: 6b1db815b91a
Revises: 1785000018, user_models
Create Date: 2026-09-16 18:19:40.142949

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b1db815b91a'
down_revision: Union[str, None] = ('1785000018', 'user_models')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
