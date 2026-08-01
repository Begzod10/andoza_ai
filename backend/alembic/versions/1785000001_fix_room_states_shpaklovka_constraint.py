"""Fix room_states CHECK constraints to include shpaklovka state

This fixes a critical bug where the model allows "shpaklovka" state
but the database CHECK constraint doesn't, causing IntegrityError on insert.

Revision ID: 1785000001
Revises: 9b3f2a7c1e4d
Create Date: 2026-07-28 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '1785000001'
down_revision = '9b3f2a7c1e4d'
branch_labels = None
depends_on = None

ROOM_STATE_VALUES = ("xom", "suvoq", "shpaklovka", "tayyor")


def upgrade() -> None:
    """Add shpaklovka to all room_states CHECK constraints."""

    # Drop existing constraints (missing shpaklovka)
    op.drop_constraint("ck_room_states_current_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_floor_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_ceiling_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_walls_state", "room_states", type_="check")

    # Recreate constraints with shpaklovka included
    op.create_check_constraint(
        "ck_room_states_current_state",
        "room_states",
        "current_state IN ({})".format(
            ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_floor_state",
        "room_states",
        "floor_state IS NULL OR floor_state IN ({})".format(
            ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_ceiling_state",
        "room_states",
        "ceiling_state IS NULL OR ceiling_state IN ({})".format(
            ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_walls_state",
        "room_states",
        "walls_state IS NULL OR walls_state IN ({})".format(
            ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
        ),
    )


def downgrade() -> None:
    """Revert to old constraints (without shpaklovka)."""

    old_room_state_values = ("xom", "suvoq", "tayyor")

    op.drop_constraint("ck_room_states_current_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_floor_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_ceiling_state", "room_states", type_="check")
    op.drop_constraint("ck_room_states_walls_state", "room_states", type_="check")

    op.create_check_constraint(
        "ck_room_states_current_state",
        "room_states",
        "current_state IN ({})".format(
            ",".join(f"'{v}'" for v in old_room_state_values)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_floor_state",
        "room_states",
        "floor_state IS NULL OR floor_state IN ({})".format(
            ",".join(f"'{v}'" for v in old_room_state_values)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_ceiling_state",
        "room_states",
        "ceiling_state IS NULL OR ceiling_state IN ({})".format(
            ",".join(f"'{v}'" for v in old_room_state_values)
        ),
    )
    op.create_check_constraint(
        "ck_room_states_walls_state",
        "room_states",
        "walls_state IS NULL OR walls_state IN ({})".format(
            ",".join(f"'{v}'" for v in old_room_state_values)
        ),
    )
