from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class EstimateLineDelta(BaseModel):
    """
    A single line item in an estimate delta.

    Shows whether the line is new (added), changed (modified),
    or removed (deleted) compared to the baseline.
    """

    label: str
    category: str = ""
    formula: str
    status: str  # "added", "changed", "removed", "unchanged"

    # Baseline values (if line existed before)
    baseline_quantity: float | None = None
    baseline_unit_price: int | None = None
    baseline_total_uzs: int | None = None

    # Current values
    current_quantity: float | None = None
    current_unit_price: int | None = None
    current_total_uzs: int | None = None

    # Computed delta
    quantity_delta: float = 0
    price_delta_uzs: int = 0


class EstimateDelta(BaseModel):
    """
    Difference between a baseline estimate and the current design state.

    Used to show users what changed since the last saved estimate.
    """

    room_id: UUID

    # Reference data
    baseline_estimate_id: UUID | None = None
    baseline_total_uzs: int = 0
    current_total_uzs: int = 0

    # Overall delta
    delta_uzs: int = 0  # current_total - baseline_total
    delta_percent: float = 0  # (delta_uzs / baseline_total_uzs * 100) if baseline > 0

    # Line items
    lines: list[EstimateLineDelta] = []
    added_count: int = 0
    changed_count: int = 0
    removed_count: int = 0
    unchanged_count: int = 0


class ElectricalDelta(BaseModel):
    """
    Electrical-specific delta: device counts and cable length.

    Narrower than full estimate delta, used on electrical plan screen.
    """

    room_id: UUID

    # Baseline (from last saved estimate)
    baseline_estimate_id: UUID | None = None
    baseline_cable_meters: float = 0
    baseline_device_count: int = 0
    baseline_device_counts_by_type: dict[str, int] = {}

    # Current (live from ElectricalDevice rows)
    current_cable_meters: float = 0
    current_device_count: int = 0
    current_device_counts_by_type: dict[str, int] = {}

    # Deltas
    cable_delta_meters: float = 0
    device_delta: int = 0
