import type { CabinetSpec } from "@/features/mebel/engine";

const end = (c: CabinetSpec) => c.position.x + (Number.isFinite(c.width) ? c.width : 0);

/**
 * Where a new cabinet of a type goes along the wall. Base and tall cabinets
 * share the floor row; wall cabinets make their own row above it, starting
 * after any tall cabinet so a wall cabinet never hangs inside one.
 */
export function nextX(cabinets: CabinetSpec[], type: CabinetSpec["type"]): number {
  if (type !== "wall") return Math.max(0, ...cabinets.filter((c) => c.type !== "wall").map(end));
  return Math.max(0, ...cabinets.filter((c) => c.type === "wall" || c.type === "tall").map(end));
}
