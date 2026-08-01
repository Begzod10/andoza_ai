"""Pure estimate delta calculation engine.

Diffs two estimate line lists (baseline vs. current) and produces a delta
showing what changed: added, removed, or modified lines.

All monetary arithmetic is done in tiyin (UZS × 100) to avoid floating-point
rounding errors.

Typical usage:

    from app.services.smeta import compute_estimate
    from app.services.estimate_delta import compute_delta

    # Load baseline (last saved estimate)
    baseline_estimate = db.query(Estimate).filter_by(...).first()
    baseline_lines = [
        {"label": "Bo'yoq", "category": "Finishing", "quantity": 10, "unit_price": 50_000, "total_uzs": 500_000},
        ...
    ]

    # Compute current state
    current_computed = compute_estimate(room, finishes, devices, ...)
    current_lines = [{"label": ..., "quantity": ..., ...} for line in current_computed.lines]

    # Diff
    delta = compute_delta(baseline_lines, current_lines)

    # Use in response
    return {"baseline_total": 500_000, "current_total": 520_000, "delta_uzs": 20_000, ...}
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class LineKey:
    """Composite key for diffing: (category, label)."""

    category: str
    label: str

    def __hash__(self) -> int:
        return hash((self.category, self.label))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, LineKey):
            return NotImplemented
        return self.category == other.category and self.label == other.label


@dataclass
class DeltaLine:
    """A single line item delta."""

    label: str
    category: str = ""
    formula: str = ""
    status: str = "unchanged"  # "added", "changed", "removed", "unchanged"

    # Baseline
    baseline_quantity: float | None = None
    baseline_unit_price: int | None = None
    baseline_total_uzs: int | None = None

    # Current
    current_quantity: float | None = None
    current_unit_price: int | None = None
    current_total_uzs: int | None = None

    # Delta
    quantity_delta: float = 0
    price_delta_uzs: int = 0


@dataclass
class EstimateDelta:
    """Result of diffing baseline vs. current estimate."""

    baseline_total_uzs: int = 0
    current_total_uzs: int = 0
    delta_uzs: int = 0
    delta_percent: float = 0.0

    lines: list[DeltaLine] = field(default_factory=list)
    added_count: int = 0
    changed_count: int = 0
    removed_count: int = 0
    unchanged_count: int = 0


def compute_delta(
    baseline_lines: list[dict] | None = None,
    current_lines: list[dict] | None = None,
) -> EstimateDelta:
    """
    Diff two estimate line lists and produce a delta.

    Lines are matched by (category, label) key. If a line appears in current
    but not baseline, it's "added". If in both but quantity/price differs,
    it's "changed". If only in baseline, it's "removed".

    Args:
        baseline_lines: List of dicts with keys: label, category, quantity, unit_price, total_uzs, formula
        current_lines: List of dicts with keys: label, category, quantity, unit_price, total_uzs, formula

    Returns:
        EstimateDelta with lines diffed and totals computed
    """

    baseline_lines = baseline_lines or []
    current_lines = current_lines or []

    # Index baseline and current by key
    baseline_map: dict[LineKey, dict] = {}
    for line in baseline_lines:
        key = LineKey(
            category=line.get("category", ""),
            label=line.get("label", ""),
        )
        baseline_map[key] = line

    current_map: dict[LineKey, dict] = {}
    for line in current_lines:
        key = LineKey(
            category=line.get("category", ""),
            label=line.get("label", ""),
        )
        current_map[key] = line

    # Diff
    delta = EstimateDelta()
    all_keys = set(baseline_map.keys()) | set(current_map.keys())

    for key in sorted(all_keys, key=lambda k: (k.category, k.label)):
        baseline_line = baseline_map.get(key)
        current_line = current_map.get(key)

        delta_line = DeltaLine(
            label=key.label,
            category=key.category,
            formula=current_line.get("formula", "") if current_line else (baseline_line.get("formula", "") if baseline_line else ""),
        )

        if baseline_line is None:
            # Added
            delta_line.status = "added"
            delta_line.current_quantity = current_line.get("quantity")
            delta_line.current_unit_price = current_line.get("unit_price")
            delta_line.current_total_uzs = current_line.get("total_uzs")
            delta_line.price_delta_uzs = current_line.get("total_uzs", 0)
            delta.added_count += 1

        elif current_line is None:
            # Removed
            delta_line.status = "removed"
            delta_line.baseline_quantity = baseline_line.get("quantity")
            delta_line.baseline_unit_price = baseline_line.get("unit_price")
            delta_line.baseline_total_uzs = baseline_line.get("total_uzs")
            delta_line.price_delta_uzs = -(baseline_line.get("total_uzs", 0))
            delta.removed_count += 1

        else:
            # Both exist; check if changed
            baseline_qty = baseline_line.get("quantity", 0)
            current_qty = current_line.get("quantity", 0)
            baseline_price = baseline_line.get("unit_price", 0)
            current_price = current_line.get("unit_price", 0)
            baseline_total = baseline_line.get("total_uzs", 0)
            current_total = current_line.get("total_uzs", 0)

            delta_line.baseline_quantity = baseline_qty
            delta_line.baseline_unit_price = baseline_price
            delta_line.baseline_total_uzs = baseline_total
            delta_line.current_quantity = current_qty
            delta_line.current_unit_price = current_price
            delta_line.current_total_uzs = current_total

            if baseline_qty != current_qty or baseline_price != current_price:
                delta_line.status = "changed"
                delta_line.quantity_delta = current_qty - baseline_qty
                delta_line.price_delta_uzs = current_total - baseline_total
                delta.changed_count += 1
            else:
                delta_line.status = "unchanged"
                delta.unchanged_count += 1

        delta.lines.append(delta_line)

    # Compute totals and overall delta
    delta.baseline_total_uzs = sum(l.get("total_uzs", 0) for l in baseline_lines)
    delta.current_total_uzs = sum(l.get("total_uzs", 0) for l in current_lines)
    delta.delta_uzs = delta.current_total_uzs - delta.baseline_total_uzs

    if delta.baseline_total_uzs > 0:
        delta.delta_percent = (delta.delta_uzs / delta.baseline_total_uzs) * 100
    elif delta.current_total_uzs > 0:
        # No baseline but has current = 100% increase
        delta.delta_percent = 100.0
    else:
        delta.delta_percent = 0.0

    return delta
