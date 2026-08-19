"""Add lat/lng coordinates to ustalar

The mobile Ustalar tab shows each usta on a map, so every craftsman needs a
latitude/longitude pair. Both columns are nullable so existing rows are valid.

Revision ID: 1785000003
Revises: wallpapers
Create Date: 2026-08-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000003'
down_revision = 'wallpapers'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'ustalar',
        sa.Column('lat', sa.Numeric(precision=9, scale=6), nullable=True),
    )
    op.add_column(
        'ustalar',
        sa.Column('lng', sa.Numeric(precision=9, scale=6), nullable=True),
    )


def downgrade():
    op.drop_column('ustalar', 'lng')
    op.drop_column('ustalar', 'lat')
