"""The tables that hold exactly one row per room (room_states,
room_decorations, room_electrical) create that row on first read."""
from __future__ import annotations

from typing import Any, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def get_or_create_room_row(db: AsyncSession, model: type[T], room_id: UUID, **defaults: Any) -> T:
    """The room's row in `model`, created with `defaults` if it has none.

    Opening a room fires several reads at once, and two of them can both find
    no row and both insert. The insert runs in a savepoint, so the one that
    loses the race on the room_id unique key rolls back only the savepoint
    and returns the row the other request created, instead of failing.
    """
    lookup = select(model).where(model.room_id == room_id)  # type: ignore[attr-defined]
    row = (await db.execute(lookup)).scalar_one_or_none()
    if row is not None:
        return row
    try:
        async with db.begin_nested():
            row = model(room_id=room_id, **defaults)
            db.add(row)
            await db.flush()
        return row
    except IntegrityError:
        return (await db.execute(lookup)).scalar_one()
