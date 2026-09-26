/**
 * Even zoom sensitivity at every distance.
 *
 * OrbitControls dollies multiplicatively: one wheel notch scales the orbit
 * radius by 0.95^zoomSpeed, so the step it actually travels is proportional
 * to how far away the camera already is. In a room that is the difference
 * between crawling a centimetre at a time while inspecting a skirting board
 * and leaping several metres per notch from outside — the same wheel, two
 * completely different sensitivities.
 *
 * So the step is chosen in METRES first and the multiplier derived from it.
 * The step still grows a little with distance (a fixed step feels sluggish
 * when you are far out), but it is clamped at both ends, which is what makes
 * inside and outside feel like the same control.
 */
export function uniformZoomSpeed(distance: number, roomSpan: number): number {
  // Target travel per notch: a tenth of the current distance, never less
  // than 8 cm (so close-up work still moves) and never more than a quarter
  // of the room (so a notch from outside cannot overshoot the whole room).
  const step = Math.min(Math.max(distance * 0.1, 0.08), Math.max(roomSpan, 1) * 0.25);
  // distance * (1 - 0.95^z) = step  ->  z = ln(1 - step/distance) / ln(0.95)
  const ratio = Math.min(step / Math.max(distance, 0.05), 0.9);
  const z = Math.log(1 - ratio) / Math.log(0.95);
  return Math.min(Math.max(z, 0.1), 6);
}

/** Retune a live OrbitControls instance for its current distance. Safe to
 *  call from the controls' own change event — it only writes zoomSpeed. */
export function applyUniformZoom(
  controls: { getDistance(): number; zoomSpeed: number } | null | undefined,
  roomSpan: number,
): void {
  if (!controls) return;
  controls.zoomSpeed = uniformZoomSpeed(controls.getDistance(), roomSpan);
}
