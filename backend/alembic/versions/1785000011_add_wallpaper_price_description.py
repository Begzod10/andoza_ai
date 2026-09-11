"""Add price_uzs and description to wallpapers

Lets an admin attach a retail price and free-form notes to an oboy at
upload time, same idea as Furniture.price_uzs — both optional, since the
library was usable without them and existing rows have neither.

Revision ID: 1785000011
Revises: 1785000010
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000011'
down_revision = '1785000010'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('wallpapers', sa.Column('price_uzs', sa.BigInteger(), nullable=True))
    op.add_column('wallpapers', sa.Column('description', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('wallpapers', 'description')
    op.drop_column('wallpapers', 'price_uzs')
