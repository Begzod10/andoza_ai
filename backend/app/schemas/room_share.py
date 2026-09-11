from __future__ import annotations

from pydantic import BaseModel


class ShareLinkOut(BaseModel):
    """Response for POST /rooms/{room_id}/share.

    Only the raw token travels over the API -- the frontend already knows
    its own origin, so it builds the full `/share/{token}` URL itself.
    """

    share_token: str


class PublicRoomOut(BaseModel):
    """Read-only room shape served by GET /public/rooms/{token} -- NO auth.

    Deliberately just enough to render a read-only 3D view: room name,
    geometry, ceiling height, wall/floor material links, and the
    design-relevant slice of `state` (see room_share._public_state).

    Deliberately excludes: `id` (the room's real UUID), `apartment_id`, and
    any owner/user reference -- a share link must only ever reveal *this
    one room's* design, never anything that lets the viewer infer or reach
    another room or the owning account.
    """

    name: str
    ceiling_h: float | None
    geometry: dict | None
    surfaces: dict | None
    state: dict | None
