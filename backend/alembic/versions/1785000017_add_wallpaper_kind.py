"""Add design-panel scope (kind) to wallpapers

Each studio design panel (Bo'yoq/Oboy, Suvoq, Shpaklovka, Pol) now keeps its
own image library instead of one shared shelf. `kind` records which panel an
image was uploaded from; a panel only lists rows matching its own kind.

The sha256 dedup is re-scoped from global to per-kind: the same image may
legitimately belong to more than one panel's library, so uniqueness moves from
sha256 alone to the (sha256, kind) pair. Existing rows are all wall wallpapers,
so they are backfilled to "oboy" — that keeps every current image in the
Bo'yoq/Oboy panel exactly as before.

Nullable + backfilled, so this is safe to run against prod later on deploy.

Revision ID: 1785000017
Revises: 1785000016
Create Date: 2026-09-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000017'
down_revision = '1785000016'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'wallpapers',
        sa.Column('kind', sa.String(length=40), nullable=True),
    )
    # Backfill: everything uploaded before scoping is a wall wallpaper (oboy).
    op.execute("UPDATE wallpapers SET kind = 'oboy' WHERE kind IS NULL")
    op.create_index(op.f('ix_wallpapers_kind'), 'wallpapers', ['kind'], unique=False)

    # sha256 was globally unique; dedup is now per-panel, so the same image can
    # live in two panels' libraries. Drop the standalone unique index, keep a
    # plain (non-unique) one for lookups, and enforce uniqueness on the pair.
    op.drop_index('ix_wallpapers_sha256', table_name='wallpapers')
    op.create_index('ix_wallpapers_sha256', 'wallpapers', ['sha256'], unique=False)
    op.create_unique_constraint(
        'uq_wallpapers_sha256_kind', 'wallpapers', ['sha256', 'kind']
    )


def downgrade():
    op.drop_constraint('uq_wallpapers_sha256_kind', 'wallpapers', type_='unique')
    op.drop_index('ix_wallpapers_sha256', table_name='wallpapers')
    op.create_index('ix_wallpapers_sha256', 'wallpapers', ['sha256'], unique=True)
    op.drop_index(op.f('ix_wallpapers_kind'), table_name='wallpapers')
    op.drop_column('wallpapers', 'kind')
