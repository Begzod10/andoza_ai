"""Add per-apartment renovation stage

The mobile Home card shows and edits a renovation stage (1..8) per apartment.
The column is non-nullable with a server_default of 1 so existing rows backfill
to stage 1.

Revision ID: 1785000006
Revises: 1785000005
Create Date: 2026-08-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000006'
down_revision = '1785000005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'apartments',
        sa.Column('renovation_stage', sa.Integer(), nullable=False, server_default='1'),
    )


def downgrade():
    op.drop_column('apartments', 'renovation_stage')
