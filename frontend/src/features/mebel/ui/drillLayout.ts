import type { Hole, Part } from "@/features/mebel/engine";

/** The left side is drawn as seen from inside the cabinet (its face A): its bottom
 *  end is then on the right. Every other part reads left to right from u = 0. */
export const isMirrored = (part: Part) => part.role === "side_left";

/** Where a hole is on the drawing, mm: `x` from the drawn left edge, `y` from the
 *  front (bottom) edge. A hole in an end edge sits on that edge, `y` along it. */
export function holeAt(part: Part, h: Hole): { x: number; y: number; edge: boolean } {
  const L = part.finished.length;
  const edge = h.face === "W1" || h.face === "W2";
  const u = edge ? (h.face === "W1" ? 0 : L) : h.u;
  return { x: isMirrored(part) ? L - u : u, y: edge ? h.u : h.v, edge };
}

/**
 * Rows for dimension labels so none overlaps: each value goes in the first row
 * whose last label is at least `gap(value)` away. Values in, rows out, same order.
 */
export function labelRows(values: number[], gap: (v: number) => number): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const last: number[] = [];
  const rows = new Array<number>(values.length);
  for (const [v, i] of order) {
    let row = last.findIndex((p) => v - p >= gap(v));
    if (row === -1) row = last.length;
    last[row] = v;
    rows[i] = row;
  }
  return rows;
}
