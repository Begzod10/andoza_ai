"""Add roll_width_cm and roll_length_m to materials

Lets a specific do'kon oboy (wallpaper) Material carry its own real roll
size. Without this, _wallpaper_lines priced every oboy product against one
hardcoded generic roll (1.06 x 10.05 m) regardless of which real product was
selected — many real rolls (including a common single-width European size,
0.53 m) are a different width, which skews the strip/roll count by roughly
2x for those products. Both columns are nullable and category-agnostic (only
oboy rows are expected to ever set them); smeta.py falls back to the current
global default whenever either is unset.

Revision ID: 1785000014
Revises: 1785000013
Create Date: 2026-09-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000014'
down_revision = '1785000013'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('materials', sa.Column('roll_width_cm', sa.Numeric(6, 1), nullable=True))
    op.add_column('materials', sa.Column('roll_length_m', sa.Numeric(6, 2), nullable=True))


def downgrade():
    op.drop_column('materials', 'roll_length_m')
    op.drop_column('materials', 'roll_width_cm')
