import type { EstimateLine } from "@/lib/api";

/**
 * The estimate's lines, grouped for reading.
 *
 * The engine tags every line with a fine-grained `category` ("suvoq", "grunt",
 * "boyoq", "elektr", ...). Thirteen of those is too many headings for a person
 * scanning a bill, so they are folded into seven that follow the order work is
 * actually done in: prepare the walls, finish them, floor, ceiling, electrics,
 * furniture, and a catch-all for anything the engine (or the AI pricing) tags
 * with something we do not know.
 */
export type GroupKey = "tayyorlash" | "pardoz" | "pol" | "shift" | "elektr" | "jihoz" | "boshqa";

/** The order sections appear in. */
export const GROUP_ORDER: GroupKey[] = ["tayyorlash", "pardoz", "pol", "shift", "elektr", "jihoz", "boshqa"];

const CATEGORY_TO_GROUP: Record<string, GroupKey> = {
  suvoq: "tayyorlash",
  grunt: "tayyorlash",
  shpatlyovka: "tayyorlash",
  boyoq: "pardoz",
  oboy: "pardoz",
  texture: "pardoz",
  laminat: "pol",
  plitka: "pol",
  plintus: "pol",
  shift: "shift",
  elektr: "elektr",
  chiroq: "elektr",
  jihoz: "jihoz",
};

/** Segment and icon-bubble colours, one per group (distinct enough to tell apart in a thin bar). */
export const GROUP_COLOUR: Record<GroupKey, string> = {
  tayyorlash: "#7C8DB5",
  pardoz: "#2F55D4",
  pol: "#F59E0B",
  shift: "#14B8A6",
  elektr: "#8B5CF6",
  jihoz: "#10B981",
  boshqa: "#94A3B8",
};

export function groupKeyFor(category: string | null | undefined): GroupKey {
  return CATEGORY_TO_GROUP[(category ?? "").trim().toLowerCase()] ?? "boshqa";
}

/** A line with its position in the estimate — the AI helper points at lines by that position. */
export interface IndexedLine {
  line: EstimateLine;
  index: number;
}

export interface LineGroup {
  key: GroupKey;
  items: IndexedLine[];
  /** Sum of the lines' totals, in so'm. */
  subtotal: number;
  /** subtotal / the sum over all groups, 0..1 (0 when there is nothing to divide). */
  share: number;
}

/** Groups in GROUP_ORDER, empty groups left out, lines in their original order within a group. */
export function groupEstimateLines(lines: EstimateLine[]): LineGroup[] {
  const buckets = new Map<GroupKey, IndexedLine[]>();
  lines.forEach((line, index) => {
    const key = groupKeyFor(line.category);
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ line, index });
    else buckets.set(key, [{ line, index }]);
  });

  const groups = GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => {
    const items = buckets.get(key)!;
    return { key, items, subtotal: items.reduce((sum, { line }) => sum + line.total_uzs, 0), share: 0 };
  });
  const grand = groups.reduce((sum, g) => sum + g.subtotal, 0);
  return groups.map((g) => ({ ...g, share: grand > 0 ? g.subtotal / grand : 0 }));
}

/** "37%", or "<1%" for a share that rounds to nothing but is not nothing. */
export function formatShare(share: number): string {
  if (share > 0 && share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/** 15 -> "15", 34.48 -> "34.48", 8.5 -> "8.5": no trailing zeros. */
export function formatQuantity(quantity: number): string {
  return String(Math.round(quantity * 100) / 100);
}
