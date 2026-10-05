/**
 * ScrollPath — geometry of the roller's route.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SECTION 1 — ROLLER PATH
 * A serpentine: down from the top-right, then R→L, curve, L→R, curve, R→L and
 * out through the left edge. All corners are true semicircles (no sharp 90°).
 * The same `d` string drives BOTH the roller position and the paint stroke, so
 * the leading edge of the paint is always exactly where the roller is.
 *
 * `T` is the roller length = thickness of each painted band. The number of
 * passes is chosen automatically (always odd, so the last pass is R→L and the
 * roller leaves on the left) so bands overlap and the wall is covered at any
 * screen size. A smaller roller (mobile) therefore means more passes.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface RouteInput {
  W: number;
  H: number;
  /** roller length / band thickness in px */
  T: number;
}

export interface Route {
  d: string;
  /** number of horizontal passes (odd) */
  rows: number;
  /** y of each pass */
  ys: number[];
  /** path distance at which the intro (drop from top) has finished and pass 1 begins */
  firstRowS: number;
}

/** bands overlap if row gap <= BAND_OVERLAP * T */
const BAND_OVERLAP = 0.92;

export function buildRoute({ W, H, T }: RouteInput): Route {
  const y1 = T * 0.38; // first band reaches (and passes) the very top of the wall
  const yN = Math.max(y1 + 1, H - T * 0.38); // last band reaches the very bottom

  let rows = 3;
  while ((yN - y1) / (rows - 1) > T * BAND_OVERLAP && rows < 15) rows += 2;

  const gap = (yN - y1) / (rows - 1);
  // Turn extremes sit close to the viewport edge: the band (±T/2) then pokes past the
  // edge, so the paint visibly runs into both sides with no white pockets.
  const xL = T * 0.16;
  const xR = W - T * 0.16;
  // corner radius: rounded, never a sharp 90°. The roller drops straight down between corners.
  const rad = Math.max(6, Math.min(gap * 0.3, T * 0.25, (xR - xL) / 4));
  const ys = Array.from({ length: rows }, (_, i) => y1 + i * gap);

  const startY = -T * 0.1; // roller starts peeking in from the top edge
  const f = (n: number) => n.toFixed(2);

  // intro: drop from the top edge, rounded corner into pass 1 (R→L)
  let d = `M${f(xR)} ${f(startY)} L${f(xR)} ${f(y1 - rad)} A${f(rad)} ${f(rad)} 0 0 1 ${f(xR - rad)} ${f(y1)}`;

  for (let i = 0; i < rows; i++) {
    const y = ys[i];
    const next = ys[i + 1];
    if (i % 2 === 0) {
      // R→L pass
      d += ` L${f(xL + rad)} ${f(y)}`;
      if (i < rows - 1) {
        d += ` A${f(rad)} ${f(rad)} 0 0 0 ${f(xL)} ${f(y + rad)} L${f(xL)} ${f(next - rad)} A${f(rad)} ${f(rad)} 0 0 0 ${f(xL + rad)} ${f(next)}`;
      } else {
        d += ` L${f(-T * 0.9)} ${f(y)}`; // exit through the left edge
      }
    } else {
      // L→R pass
      d += ` L${f(xR - rad)} ${f(y)}`;
      if (i < rows - 1) {
        d += ` A${f(rad)} ${f(rad)} 0 0 1 ${f(xR)} ${f(y + rad)} L${f(xR)} ${f(next - rad)} A${f(rad)} ${f(rad)} 0 0 1 ${f(xR - rad)} ${f(next)}`;
      }
    }
  }

  // intro length = straight drop + quarter circle
  return { d, rows, ys, firstRowS: y1 - rad - startY + (Math.PI / 2) * rad };
}

/* ── sampling: lookup table so per-frame lookups are O(1) and need no DOM calls ── */

export interface RouteLut {
  step: number;
  count: number;
  length: number;
  /** x, y, tx, ty per sample (tangent normalised) */
  data: Float32Array;
}

export function sampleRoute(path: SVGPathElement, step: number): RouteLut {
  const length = path.getTotalLength();
  const count = Math.ceil(length / step) + 1;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const pt = path.getPointAtLength(Math.min(i * step, length));
    data[i * 4] = pt.x;
    data[i * 4 + 1] = pt.y;
  }
  for (let i = 0; i < count; i++) {
    const a = Math.max(i - 1, 0) * 4;
    const b = Math.min(i + 1, count - 1) * 4;
    const dx = data[b] - data[a];
    const dy = data[b + 1] - data[a + 1];
    const len = Math.hypot(dx, dy) || 1;
    data[i * 4 + 2] = dx / len;
    data[i * 4 + 3] = dy / len;
  }
  return { step, count, length, data };
}

export interface PathPoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
}

/** point + direction at path distance `s` (px) */
export function pointAt(lut: RouteLut, s: number, out: PathPoint): PathPoint {
  const f = Math.min(Math.max(s / lut.step, 0), lut.count - 1);
  const i = Math.floor(f);
  const j = Math.min(i + 1, lut.count - 1);
  const k = f - i;
  const d = lut.data;
  out.x = d[i * 4] + (d[j * 4] - d[i * 4]) * k;
  out.y = d[i * 4 + 1] + (d[j * 4 + 1] - d[i * 4 + 1]) * k;
  out.tx = d[i * 4 + 2] + (d[j * 4 + 2] - d[i * 4 + 2]) * k;
  out.ty = d[i * 4 + 3] + (d[j * 4 + 3] - d[i * 4 + 3]) * k;
  return out;
}

/** path distance (px) of the sample closest to the point (x, y) */
export function nearestS(lut: RouteLut, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  const d = lut.data;
  for (let i = 0; i < lut.count; i++) {
    const dx = d[i * 4] - x;
    const dy = d[i * 4 + 1] - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  return best * lut.step;
}
