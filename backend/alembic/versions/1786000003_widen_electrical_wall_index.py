"""Let an electrical device sit on any wall the room actually has

``electrical_devices.wall_index`` was capped at 3 by
``ck_electrical_device_wall_index`` — the same A/B/C/D-rectangle assumption
that ``1786000002`` has just removed from ``room_finishes``. A LiDAR-scanned
room is an N-wall polygon (the real production scan has five), so its 5th wall
could never hold a socket, a switch or the panel, and the auto-generated plan
(``app.services.room_electrical_auto``) could not be persisted at all.

This keeps the lower bound — a negative wall index is still meaningless — and
drops the upper one. Which indices a given room actually has depends on its
own geometry, which only the API layer knows, so that check belongs there and
not in a table-wide CHECK.

Reversibility: downgrade restores the original ``<= 3`` CHECK. Rows on a wall
above index 3 are deleted first — there is no value they could be narrowed to,
and they can only have been created after this migration ran.

Revision ID: 1786000003
Revises: 1786000002
Create Date: 2026-09-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1786000003'
down_revision = '1786000002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_electrical_device_wall_index", "electrical_devices", type_="check"
    )
    op.create_check_constraint(
        "ck_electrical_device_wall_index",
        "electrical_devices",
        "wall_index >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_electrical_device_wall_index", "electrical_devices", type_="check"
    )
    op.execute(sa.text("DELETE FROM electrical_devices WHERE wall_index > 3"))
    op.create_check_constraint(
        "ck_electrical_device_wall_index",
        "electrical_devices",
        "wall_index >= 0 AND wall_index <= 3",
    )
