"""Add share_token to rooms for public read-only share links

Lets a room owner generate a public, unauthenticated link ("Ulashish") that
shows a read-only 3D view of exactly that room -- no editing, no login. The
column is nullable (most rooms are never shared) and carries a UNIQUE index:
two rooms must never collide on the same token, and the public lookup
(GET /public/rooms/{token}) needs to be a fast indexed equality match rather
than a table scan.

The token itself is generated in app/routers/room_share.py via
secrets.token_urlsafe(24) -- never derived from the room's id, never
sequential -- so the column only ever holds NULL or a real random value.

Revision ID: 1785000015
Revises: 1785000014
Create Date: 2026-09-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000015'
down_revision = '1785000014'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('rooms', sa.Column('share_token', sa.String(64), nullable=True))
    op.create_index(op.f('ix_rooms_share_token'), 'rooms', ['share_token'], unique=True)


def downgrade():
    op.drop_index(op.f('ix_rooms_share_token'), table_name='rooms')
    op.drop_column('rooms', 'share_token')
