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

/**
 * How far out the camera may go: exactly far enough to see the whole room, and
 * not one step further.
 *
 * The limit used to be `max(W, D) * 4 + 6`, which for an ordinary 5.7 x 3.85 m
 * room is nearly 29 metres. A 5.7 m room seen from 29 m is a postage stamp in
 * the middle of an empty sky, and every notch of zoom-out past the point where
 * the room already fits spends the screen on nothing. Zooming out should stop
 * where there is nothing left to reveal.
 *
 * The room is treated as the sphere that contains it, which is what makes one
 * number right at every camera angle: an orbiting camera sees the room's
 * diagonal from some directions and its short side from others, and a limit
 * derived from the footprint alone would clip the corners from exactly the
 * angles people orbit to.
 *
 * The binding constraint is the NARROWER of the two half-angles. A phone held
 * upright is much narrower across than it is tall, so a distance that fits the
 * room vertically still cuts its sides off; taking the smaller of the two is
 * what makes "fully visible" true in both directions.
 */
export function fitRoomDistance(
  room: { W: number; D: number; H: number },
  verticalFovDeg: number,
  aspect: number,
): number {
  // Half the room's space diagonal — the radius of the sphere it sits in,
  // about its own centre, which is what the camera orbits.
  const radius = 0.5 * Math.hypot(
    Math.max(room.W, 0.1),
    Math.max(room.H, 0.1),
    Math.max(room.D, 0.1),
  );

  const vHalf = (Math.max(verticalFovDeg, 1) * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 0.01));
  const half = Math.min(vHalf, hHalf);

  // A hair of air around the room, so the walls are not jammed against the
  // edge of the frame at full zoom-out.
  const MARGIN = 1.06;
  return (radius / Math.sin(half)) * MARGIN;
}
