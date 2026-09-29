"""Re-base studio-placed openings onto the centre convention

``WallElement.position`` is a 0..1 fraction naming the opening's CENTRE along
its wall (see the comment on the field in ``app/schemas/room.py``). Everything
server-side has always meant that: ``room_scan_converter`` writes the scanned
surface's centre, ``room_electrical_auto`` reads ``position * length`` back as
one. The studio, however, read the fraction straight into its own millimetre
field, which means the opening's LEFT EDGE, and wrote it back the same way — so
a room saved from the studio *after the user dragged an opening* carries a
left-edge fraction where the schema says centre. Half a width out: 450 mm for a
900 mm door.

The studio has been fixed to convert at the API boundary, which makes every
scan-written row correct as it stands. The rows this migration exists for are
the ones the studio itself placed.

WHICH ROWS. Nothing in ``rooms.geometry`` distinguishes the two provenances —
the numbers are the same shape. ``rooms.state`` does: it is written in the same
request as ``geometry``, from the same in-memory array, so its
``geometry.walls[i].elements[j]`` is the element-by-element twin of the
persisted one, and it carries the studio's ``positionAuto`` flag. An element is
treated as studio-placed when its twin says so:

  * ``positionAuto == false`` — set only by a drag or a keyboard nudge, so this
    is direct evidence of a user placement, on any room;
  * ``positionAuto`` absent and the twin's millimetre ``position`` > 0, on a
    room with no ``room_scan`` — the pre-flag fallback the frontend itself uses
    (``needsAutoPlacement`` in ``lib/wallPositions.ts``). Restricted to
    hand-drawn and wizard rooms because on a scanned room an untouched opening
    also round-trips through the store with a positive position; there, absence
    of the flag means "never dragged", not "dragged before the flag existed".

Everything else is left exactly as it is: scan-written centres, and the 0.5 the
old save path wrote for an auto-placed opening (0.5 already means "centred on
the wall", which is where such an opening renders).

KNOWN GAP. ``positionAuto`` landed on 2026-09-13; wall-opening dragging landed
on 2026-08-26. A hand-drawn room is covered for that window by the fallback
above, but a *scanned* room whose opening was dragged in those two and a half
weeks cannot be told apart from an untouched one and is left alone — it keeps
the half-width offset it already had rather than risking a wrong shift on every
untouched scan. Re-dragging the opening fixes it for good.

NOT RECOVERABLE. Two or more auto-placed openings on one wall were all saved as
the literal 0.5 by the old shortcut, losing the spread they were drawn with.
The fraction that survived says nothing about where they were, so this
migration cannot restore them; they stay stacked at the wall's midpoint until
someone moves them. New saves no longer do this.

Reversibility: downgrade subtracts the same half-width from the same rows,
selected by the same rule, which is exact — the upgrade's ``min(1.0, …)`` clamp
can only bite on an opening whose centre would sit past the far corner, and a
left-edge fraction that high already means the opening hangs off the wall.

Revision ID: 1786000004
Revises: 1786000003
Create Date: 2026-09-19 00:00:00.000000

"""
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1786000004'
down_revision = '1786000003'
branch_labels = None
depends_on = None


def _studio_placed(twin: dict | None, is_scan: bool) -> bool:
    """Whether the state blob's twin element is an explicit studio placement.

    Mirrors `needsAutoPlacement` in frontend/src/lib/wallPositions.ts, inverted,
    plus the scan restriction explained in the module docstring.
    """
    if not isinstance(twin, dict):
        return False
    auto = twin.get("positionAuto")
    if auto is False:
        return True
    if auto is None and not is_scan:
        position = twin.get("position")
        return isinstance(position, (int, float)) and position > 0
    return False


def _shift(connection, sign: int) -> None:
    """Move every studio-placed opening by `sign` × half its width."""
    rows = connection.execute(
        sa.text(
            "SELECT id, geometry, state, room_scan IS NOT NULL AS is_scan "
            "FROM rooms WHERE geometry IS NOT NULL"
        )
    ).mappings().all()

    for row in rows:
        geometry = row["geometry"]
        if not isinstance(geometry, dict):
            continue
        walls = geometry.get("walls")
        if not isinstance(walls, list):
            continue
        state = row["state"] if isinstance(row["state"], dict) else {}
        state_walls = (state.get("geometry") or {}).get("walls")
        if not isinstance(state_walls, list):
            continue

        changed = False
        for i, wall in enumerate(walls):
            if not isinstance(wall, dict) or i >= len(state_walls):
                continue
            length = wall.get("length")
            elements = wall.get("elements")
            twins = (state_walls[i] or {}).get("elements")
            if not length or not isinstance(elements, list) or not isinstance(twins, list):
                continue
            for j, element in enumerate(elements):
                if not isinstance(element, dict) or j >= len(twins):
                    continue
                if not _studio_placed(twins[j], row["is_scan"]):
                    continue
                width, position = element.get("width"), element.get("position")
                if not isinstance(width, (int, float)) or not isinstance(position, (int, float)):
                    continue
                moved = position + sign * (width / 2.0) / length
                element["position"] = min(1.0, max(0.0, moved))
                changed = True

        if changed:
            connection.execute(
                sa.text(
                    "UPDATE rooms SET geometry = CAST(:geometry AS jsonb) WHERE id = :id"
                ),
                {"geometry": json.dumps(geometry), "id": row["id"]},
            )


def upgrade() -> None:
    _shift(op.get_bind(), +1)


def downgrade() -> None:
    _shift(op.get_bind(), -1)
