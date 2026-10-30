import type { CabinetSpec } from "@/features/mebel/engine";

const w = (c: CabinetSpec) => (Number.isFinite(c.width) ? c.width : 0);
const end = (c: CabinetSpec) => c.position.x + w(c);

/**
 * Where a new cabinet of a type goes along the wall. Base and tall cabinets
 * share the floor row. A wall cabinet hangs over the base cabinets: it takes
 * the first gap from the start of the wall that is wide enough for it and
 * clear of the other wall cabinets and of every tall cabinet.
 */
export function nextX(cabinets: CabinetSpec[], type: CabinetSpec["type"], width: number): number {
  if (type !== "wall") return Math.max(0, ...cabinets.filter((c) => c.type !== "wall").map(end));
  const taken = cabinets
    .filter((c) => c.type === "wall" || c.type === "tall")
    .map((c) => [c.position.x, end(c)] as const)
    .sort((a, b) => a[0] - b[0]);
  let x = 0;
  for (const [from, to] of taken) {
    if (from >= x + width) break;
    x = Math.max(x, to);
  }
  return x;
}
