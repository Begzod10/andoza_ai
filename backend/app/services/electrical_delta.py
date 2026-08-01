"""Electrical-specific delta calculation engine.

Narrower than full estimate delta, focusing on electrical devices:
- Device counts by type (socket, switch, light, panel, box)
- Total cable run length in metres

Used by the electrical plan screen to show "what changed since last estimate"
without computing the full multi-category estimate delta.

Typical usage:

    # Load baseline electrical lines from last saved estimate
    baseline_lines = [
        {"category": "Elektr", "label": "Sim", "quantity": 79.97, "unit": "m", ...},
        {"category": "Elektr", "label": "Rozetka", "quantity": 9, "unit": "dona", ...},
        ...
    ]

    # Compute current electrical devices
    current_devices = db.query(ElectricalDevice).filter_by(room_id=room_id).all()
    current_cable_meters, current_device_counts = from_devices(current_devices)

    # Diff
    delta = compute_electrical_delta(baseline_lines, current_cable_meters, current_device_counts)

    # Use in response
    return {"baseline_cable_meters": 79.97, "current_cable_meters": 85.5, "cable_delta": 5.53, ...}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.electrical import ElectricalDevice


@dataclass
class ElectricalDelta:
    """Result of comparing baseline and current electrical state."""

    # Baseline (from last saved estimate)
    baseline_cable_meters: float = 0.0
    baseline_device_counts: dict[str, int] = field(default_factory=dict)

    # Current (computed from ElectricalDevice rows)
    current_cable_meters: float = 0.0
    current_device_counts: dict[str, int] = field(default_factory=dict)

    # Deltas
    cable_delta_meters: float = 0.0
    device_delta: int = 0
    device_type_deltas: dict[str, int] = field(default_factory=dict)


def extract_electrical_from_lines(lines: list[dict]) -> tuple[float, dict[str, int]]:
    """
    Extract cable length and device counts from estimate lines.

    Looks for lines with category="Elektr" (Electrical) and extracts:
    - Cable length from lines with label containing "Sim" (Wire)
    - Device counts from labels like "Rozetka" (Socket), "Kontakt" (Switch), etc.

    Args:
        lines: List of estimate line dicts with keys: category, label, quantity, unit

    Returns:
        Tuple of (cable_meters: float, device_counts: dict[str, int])
    """

    cable_meters = 0.0
    device_counts: dict[str, int] = {}

    for line in lines:
        if line.get("category", "") != "Elektr":
            continue

        label = line.get("label", "").lower()
        quantity = line.get("quantity", 0)

        # Cable length
        if "sim" in label or "provod" in label or "cable" in label:
            cable_meters = float(quantity)

        # Device counts
        elif "rozetka" in label or "socket" in label:
            device_counts["socket"] = int(quantity)
        elif "kontakt" in label or "switch" in label:
            device_counts["switch"] = int(quantity)
        elif "lampochka" in label or "light" in label or "chiroq" in label:
            device_counts["light"] = int(quantity)
        elif "korobka" in label or "panel" in label or "box" in label:
            device_counts["panel"] = int(quantity)

    return cable_meters, device_counts


def count_devices_by_type(devices: list[ElectricalDevice] | None = None) -> tuple[float, dict[str, int]]:
    """
    Count electrical devices by type and estimate cable length.

    Cable length is estimated based on device count and room average wiring run.
    This matches the heuristic in smeta.py::_electrical_line

    Args:
        devices: List of ElectricalDevice ORM objects

    Returns:
        Tuple of (estimated_cable_meters: float, device_counts: dict[str, int])
    """

    devices = devices or []

    device_counts: dict[str, int] = {}
    for device in devices:
        dtype = device.type
        device_counts[dtype] = device_counts.get(dtype, 0) + device.count

    # Estimate cable length based on device count (from smeta.py constants)
    ELEC_AVG_RUN_M = 8.0  # Average run per device
    ELEC_SLACK = 1.15      # 15% slack for vertical runs, connections
    total_devices = sum(device_counts.values())
    cable_meters = total_devices * ELEC_AVG_RUN_M * ELEC_SLACK if total_devices > 0 else 0.0

    return cable_meters, device_counts


def compute_electrical_delta(
    baseline_lines: list[dict] | None = None,
    current_cable_meters: float = 0.0,
    current_device_counts: dict[str, int] | None = None,
) -> ElectricalDelta:
    """
    Diff baseline electrical estimate vs. current electrical devices.

    Args:
        baseline_lines: List of estimate line dicts (from last saved Estimate.lines)
        current_cable_meters: Estimated total cable length in metres
        current_device_counts: Dict of device type → count (from ElectricalDevice rows)

    Returns:
        ElectricalDelta with baseline vs. current comparison
    """

    baseline_lines = baseline_lines or []
    current_device_counts = current_device_counts or {}

    # Extract baseline electrical values
    baseline_cable_meters, baseline_device_counts = extract_electrical_from_lines(baseline_lines)

    # Compute deltas
    delta = ElectricalDelta(
        baseline_cable_meters=baseline_cable_meters,
        baseline_device_counts=baseline_device_counts,
        current_cable_meters=current_cable_meters,
        current_device_counts=current_device_counts,
    )

    delta.cable_delta_meters = current_cable_meters - baseline_cable_meters
    delta.device_delta = sum(current_device_counts.values()) - sum(baseline_device_counts.values())

    # Per-type deltas
    all_types = set(baseline_device_counts.keys()) | set(current_device_counts.keys())
    for dtype in sorted(all_types):
        baseline_count = baseline_device_counts.get(dtype, 0)
        current_count = current_device_counts.get(dtype, 0)
        delta.device_type_deltas[dtype] = current_count - baseline_count

    return delta
