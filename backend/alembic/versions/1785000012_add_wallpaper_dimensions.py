"""Add width_cm, height_cm, and total_length_m to wallpapers

The library holds two kinds of oboy: repeating-pattern rolls (sold by the
metre — width_cm + total_length_m) and mural-style photo panels sold as one
fixed piece (width_cm + height_cm). All three stay independently optional
since either shape leaves one of height/total_length blank.

Revision ID: 1785000012
Revises: 1785000011
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000012'
down_revision = '1785000011'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('wallpapers', sa.Column('width_cm', sa.Numeric(6, 1), nullable=True))
    op.add_column('wallpapers', sa.Column('height_cm', sa.Numeric(6, 1), nullable=True))
    op.add_column('wallpapers', sa.Column('total_length_m', sa.Numeric(6, 2), nullable=True))


def downgrade():
    op.drop_column('wallpapers', 'total_length_m')
    op.drop_column('wallpapers', 'height_cm')
    op.drop_column('wallpapers', 'width_cm')
