"""What the signed-in account is, in terms the apps can branch on.

There is no ``role`` column. A person is always a user; they are a shop owner
when they own a shop (``stores.owner_user_id``) and an usta when they own a
craftsman profile (``ustalar.owner_user_id``) — in any moderation status, so a
pending applicant already sees their own business area. Someone can be all
three at once. Kept out of ``/auth`` responses on purpose: those are shared by
every login path, and this is one cheap extra call the apps make after sign-in.
"""
from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.store import Store
from app.models.usta import Usta

router = APIRouter(prefix="/account", tags=["account"])


class AccountRoles(BaseModel):
    roles: list[str]
    store_status: str | None = None
    store_name: str | None = None
    usta_status: str | None = None
    usta_name: str | None = None


def roles_for(*, is_admin: bool, has_store: bool, has_usta: bool) -> list[str]:
    roles = ["user"]
    if has_store:
        roles.append("shop_owner")
    if has_usta:
        roles.append("usta")
    if is_admin:
        roles.append("admin")
    return roles


@router.get("/roles", response_model=AccountRoles, summary="The caller's roles and the state of each business")
async def get_roles(current_user: CurrentUser, db: DbSession) -> AccountRoles:
    store = (await db.execute(select(Store).where(Store.owner_user_id == current_user.id))).scalar_one_or_none()
    usta = (await db.execute(select(Usta).where(Usta.owner_user_id == current_user.id))).scalar_one_or_none()
    return AccountRoles(
        roles=roles_for(
            is_admin=bool(getattr(current_user, "is_admin", False)),
            has_store=store is not None,
            has_usta=usta is not None,
        ),
        store_status=store.status if store else None,
        store_name=store.name if store else None,
        usta_status=usta.status if usta else None,
        usta_name=usta.name if usta else None,
    )
