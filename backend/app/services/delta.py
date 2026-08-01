"""Delta calculation engine — the core of the UyTa'mir redesign.

Compares the material/cost DIFFERENCE between:
  * ``full_estimate``  – cost as if the room were completely raw (korobka/xom)
  * ``delta_estimate`` – cost of only the work still required, given the
                          room's current construction-progress state

Pure function, no I/O — call from a router after loading the required ORM
objects (Room, RoomState, materials_map, norms_map).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.services.smeta import ComputedEstimate, STAGE_ORDER, compute_estimate, stage_index

if TYPE_CHECKING:
    from app.models.material import Material
    from app.models.norm import Norm
    from app.models.room import Room
    from app.models.room_state import RoomState

# ---------------------------------------------------------------------------
# Stage metadata (Uzbek labels for UI display)
# ---------------------------------------------------------------------------

STAGE_LABELS_UZ: dict[str, str] = {
    "xom": "Qora qurilish (korobka)",
    "suvoq": "Suvoq",
    "shpaklovka": "Shpaklovka / Grunt",
    "tayyor": "Pardoz (tayyor)",
}


@dataclass
class DeltaStageInfo:
    """A single construction stage, tagged as done or still remaining."""
    stage: str
    label_uz: str
    already_done: bool


@dataclass
class DeltaResult:
    """Full current-vs-finished comparison for a room."""
    full_estimate: ComputedEstimate
    delta_estimate: ComputedEstimate
    delta_savings_uzs: int
    completed_stages: list[DeltaStageInfo] = field(default_factory=list)
    remaining_stages: list[DeltaStageInfo] = field(default_factory=list)


def _stages_from(current_state: str) -> tuple[list[DeltaStageInfo], list[DeltaStageInfo]]:
    """Split STAGE_ORDER into (completed, remaining) around *current_state*."""
    current_idx = stage_index(current_state)
    completed = [
        DeltaStageInfo(stage=s, label_uz=STAGE_LABELS_UZ.get(s, s), already_done=True)
        for s in STAGE_ORDER
        if stage_index(s) < current_idx
    ]
    remaining = [
        DeltaStageInfo(stage=s, label_uz=STAGE_LABELS_UZ.get(s, s), already_done=False)
        for s in STAGE_ORDER
        if stage_index(s) >= current_idx
    ]
    return completed, remaining


def compute_delta(
    room: "Room",
    room_state: "RoomState",
    materials_map: dict[str, "Material"],
    norms_map: dict[str, "Norm"],
) -> DeltaResult:
    """Compute the material DIFFERENCE between the room's current state and
    a fully-finished room.

    ``full_estimate``    – cost as if the room were completely raw (xom).
                            Used purely as the reference point for
                            ``delta_savings_uzs``; never persisted or shown
                            as the "price to pay" anywhere in the flow.
    ``delta_estimate``   – cost of only the work still required, given
                            ``room_state.current_state`` (and the optional
                            per-surface overrides). This is what the user
                            actually pays.
    ``delta_savings_uzs`` – full_estimate.total_uzs - delta_estimate.total_uzs,
                            i.e. how much the user saves by not having to
                            redo stages that are already complete. Never
                            negative.
    """
    full = compute_estimate(
        room,
        materials_map,
        norms_map,
        current_state="xom",
        floor_state="xom",
        ceiling_state="xom",
    )
    delta = compute_estimate(
        room,
        materials_map,
        norms_map,
        current_state=room_state.current_state,
        floor_state=room_state.floor_state or room_state.current_state,
        ceiling_state=room_state.ceiling_state or room_state.current_state,
    )

    savings = max(0, full.total_uzs - delta.total_uzs)
    completed, remaining = _stages_from(room_state.current_state)

    return DeltaResult(
        full_estimate=full,
        delta_estimate=delta,
        delta_savings_uzs=savings,
        completed_stages=completed,
        remaining_stages=remaining,
    )
