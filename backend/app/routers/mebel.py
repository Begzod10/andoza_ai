"""The /mebel mini-app's storage: a workshop's cabinet projects and its price
book. The calculation itself runs in the browser (the engine is pure
TypeScript); the server only keeps what the user typed, scoped to them."""
from __future__ import annotations

import uuid as uuid_module
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.v1.deps import CurrentUser, DbSession
from app.models.furniture_project import FurnitureProject
from app.models.price_book import PriceBook
from app.schemas.mebel import PriceBookIn, ProjectIn, ProjectOut, ProjectSummary

router = APIRouter(prefix="/mebel", tags=["mebel"])


def _stored(data) -> dict:
    """The project JSON as saved. A cabinet on "auto" doors keeps no `doors` key: the
    frontend reads a stored null as a door count, not as auto."""
    out = data.model_dump(mode="json")
    for cab in out.get("cabinets", []):
        if cab.get("doors") is None:
            cab.pop("doors", None)
    return out


async def _own_project(db, user, project_id: uuid_module.UUID) -> FurnitureProject:
    row = (await db.execute(select(FurnitureProject).where(FurnitureProject.id == project_id))).scalar_one_or_none()
    # Someone else's project is "not found", so ids cannot be probed.
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loyiha topilmadi")
    return row


@router.get("/projects", response_model=list[ProjectSummary], summary="The caller's furniture projects, newest first")
async def list_projects(current_user: CurrentUser, db: DbSession) -> list[FurnitureProject]:
    rows = await db.execute(
        select(FurnitureProject)
        .where(FurnitureProject.user_id == current_user.id)
        .order_by(FurnitureProject.updated_at.desc())
    )
    return list(rows.scalars().all())


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED, summary="Create a project")
async def create_project(body: ProjectIn, current_user: CurrentUser, db: DbSession) -> FurnitureProject:
    now = datetime.now(timezone.utc)
    row = FurnitureProject(
        id=uuid_module.uuid4(), user_id=current_user.id, name=body.name,
        data=_stored(body.data), schema_version=body.data.schemaVersion,
        created_at=now, updated_at=now,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/projects/{project_id}", response_model=ProjectOut, summary="One project")
async def get_project(project_id: uuid_module.UUID, current_user: CurrentUser, db: DbSession) -> FurnitureProject:
    return await _own_project(db, current_user, project_id)


@router.put("/projects/{project_id}", response_model=ProjectOut, summary="Replace a project's name and data")
async def update_project(
    project_id: uuid_module.UUID, body: ProjectIn, current_user: CurrentUser, db: DbSession,
) -> FurnitureProject:
    row = await _own_project(db, current_user, project_id)
    row.name = body.name
    row.data = _stored(body.data)
    row.schema_version = body.data.schemaVersion
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return row


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a project")
async def delete_project(project_id: uuid_module.UUID, current_user: CurrentUser, db: DbSession) -> Response:
    row = await _own_project(db, current_user, project_id)
    await db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/price-book", response_model=dict, summary="The caller's price book ({} when none yet)")
async def get_price_book(current_user: CurrentUser, db: DbSession) -> dict:
    row = (await db.execute(select(PriceBook).where(PriceBook.user_id == current_user.id))).scalar_one_or_none()
    return row.data if row is not None else {}


@router.put("/price-book", response_model=dict, summary="Replace the caller's price book")
async def put_price_book(body: PriceBookIn, current_user: CurrentUser, db: DbSession) -> dict:
    data = body.data.model_dump(mode="json")
    # One statement, so two first saves at once cannot both try to insert.
    stmt = pg_insert(PriceBook).values(user_id=current_user.id, data=data)
    await db.execute(stmt.on_conflict_do_update(
        index_elements=[PriceBook.user_id], set_={"data": stmt.excluded.data, "updated_at": func.now()},
    ))
    return data
