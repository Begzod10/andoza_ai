"""Assemble unified design state from normalized database tables.

This module provides a single adapter function that reads from RoomFinish,
ElectricalDevice, and RoomFurniturePlacement tables and constructs a
DesignState dataclass that mirrors the legacy room.state schema.

This enables:
1. Gradual migration from JSONB blobs to normalized tables
2. Single source of truth for estimate computation (via smeta.py)
3. Consistent delta calculations across finishes, electrical, and furniture

Typical usage:

    # Load ORM rows
    finishes = db.query(RoomFinish).filter_by(room_id=room_id).all()
    devices = db.query(ElectricalDevice).filter_by(room_id=room_id).all()
    placements = db.query(RoomFurniturePlacement).filter_by(room_id=room_id).all()

    # Assemble state
    design_state = assemble_design_state(room, finishes, devices, placements)

    # Use in smeta
    computed = compute_estimate(room, design_state, materials_map, norms_map)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.room import Room
    from app.models.room_finish import RoomFinish
    from app.models.electrical import ElectricalDevice
    from app.models.room_furniture_placement import RoomFurniturePlacement


@dataclass
class DesignState:
    """Unified design state read from normalized tables or legacy room.state."""

    wall_coverings: dict[str, dict] = field(default_factory=dict)
    """
    Maps surface key (wall_a, wall_b, floor, ceiling) to finish dict.
    Example: {"wall_a": {"material_id": "...", "finish_type": "paint", "color": "#ff0000"}}
    """

    electricals: list[dict] = field(default_factory=list)
    """List of electrical device placements."""

    lights: list[dict] = field(default_factory=list)
    """List of light placements (subset of electricals or separate)."""

    furniture: list[dict] = field(default_factory=list)
    """List of furniture placements."""


def assemble_design_state(
    room: Room,
    finishes: list[RoomFinish] | None = None,
    devices: list[ElectricalDevice] | None = None,
    placements: list[RoomFurniturePlacement] | None = None,
) -> DesignState:
    """
    Assemble a DesignState from normalized ORM tables.

    If any table is not provided (None), falls back to room.state JSONB
    if it exists (for backward compatibility). If room.state is also empty,
    returns an empty DesignState.

    Args:
        room: Room ORM object
        finishes: List of RoomFinish rows (optional; falls back to room.state)
        devices: List of ElectricalDevice rows (optional; falls back to room.state)
        placements: List of RoomFurniturePlacement rows (optional; falls back to room.state)

    Returns:
        DesignState dataclass with all design choices
    """

    state = DesignState()

    # Fall back to room.state if normalized tables not provided
    legacy_state = room.state or {}

    # --- Wall Coverings (finishes) ---
    if finishes is not None:
        for finish in finishes:
            key = finish.surface
            state.wall_coverings[key] = {
                "material_id": str(finish.material_id) if finish.material_id else None,
                "finish_type": finish.finish_type,
                "color": finish.color_hex,
                "wall_index": finish.wall_index,
            }
    else:
        # Fall back to legacy room.state wallCoverings
        state.wall_coverings = legacy_state.get("wallCoverings", {})

    # --- Electrical Devices ---
    if devices is not None:
        state.electricals = [
            {
                "id": str(device.id),
                "type": device.type,
                "variant": device.variant,
                "wall_index": device.wall_index,
                "x": float(device.x),
                "y": float(device.y),
                "count": device.count,
            }
            for device in devices
        ]
        # Separate lights from other electricals
        state.lights = [d for d in state.electricals if d.get("type") == "light"]
    else:
        # Fall back to legacy room.state electricals and lights
        state.electricals = legacy_state.get("electricals", [])
        state.lights = legacy_state.get("lights", [])

    # --- Furniture Placements ---
    if placements is not None:
        state.furniture = [
            {
                "id": str(placement.id),
                "furniture_id": str(placement.furniture_id),
                "x": float(placement.x),
                "y": float(placement.y),
                "rotation": float(placement.rotation),
                "z_index": placement.z_index,
            }
            for placement in placements
        ]
    else:
        # Fall back to legacy room.state furniture
        state.furniture = legacy_state.get("furniture", [])

    return state
