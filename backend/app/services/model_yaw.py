"""Turning a furniture model: keep footprint_w/d in step with model_yaw."""
from __future__ import annotations

from app.models.furniture import Furniture


def apply_model_yaw(furniture: Furniture, new_yaw: int, footprint_sent: bool) -> None:
    """Set model_yaw. footprint_w/d are stored after the turn, so a quarter turn
    (0/180 <-> 90/270) swaps them, unless the caller sent a footprint of its own."""
    current = furniture.model_yaw or 0  # unset on a row not yet flushed
    if not footprint_sent and (current // 90) % 2 != (new_yaw // 90) % 2:
        furniture.footprint_w, furniture.footprint_d = furniture.footprint_d, furniture.footprint_w
    furniture.model_yaw = new_yaw
