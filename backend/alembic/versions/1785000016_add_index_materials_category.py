"""Add index on materials.category

materials.category had no index while its sibling catalog tables
(furniture.category, ustalar.category) already do — catalog list/filter
endpoints that filter materials by category were doing a full table scan.
This adds a plain btree index to match the existing pattern on those two
tables. No other schema change.

Revision ID: 1785000016
Revises: 1785000015
Create Date: 2026-09-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000016'
down_revision = '1785000015'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(op.f('ix_materials_category'), 'materials', ['category'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_materials_category'), table_name='materials')
