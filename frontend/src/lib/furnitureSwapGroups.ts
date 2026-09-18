import type { CatalogFurniture } from "@/lib/api";

/**
 * Which catalog rows the "Buyum qo'shish" sheet's Mebel list shows, and how
 * they're grouped under headings.
 *
 * The interesting case is swap mode (opened from a scanned-object ghost's
 * "Katalogdan almashtirish"): the scan→catalog mapping only ever produces
 * one of five categories (stul/stol/shkaf/divan/karavot), while the real
 * catalog keeps everything without a dedicated category — armchairs, rugs,
 * TVs, kitchen sets — under `boshqa`. An exact-category-only filter therefore
 * offers a scanned chair exactly the `stul` rows and hides the `boshqa` ones
 * completely, even though a "Kreslo" is a perfectly good replacement for a
 * scanned chair. So we keep the exact matches first and primary, and append
 * the `boshqa` rows below as a clearly-labelled second group instead of
 * dropping them.
 */

/** Catch-all admin-catalog category — armchairs, rugs, TVs, kitchen sets. */
export const SWAP_FALLBACK_CATEGORY = "boshqa";

export const SWAP_EXACT_HEADING = "Mos keladiganlar";
export const SWAP_RELATED_HEADING = "Boshqa mos kelishi mumkin";

export type FurnitureGroupKey = "exact" | "related" | "all";

export interface FurnitureGroup {
  key: FurnitureGroupKey;
  /** Null = render the list with no heading (single, self-evident group). */
  heading: string | null;
  items: CatalogFurniture[];
}

export interface FurnitureGroupOptions {
  /** Swap mode — opened from a scanned object, list scoped to its category. */
  isSwap: boolean;
  /** The scanned object's mapped catalog category; null = no category signal. */
  initialCategory?: string | null;
  /** Browsing mode only: the room-type tab's real catalog key. */
  roomTypeKey?: string;
}

export function buildFurnitureGroups(
  furniture: CatalogFurniture[],
  { isSwap, initialCategory, roomTypeKey }: FurnitureGroupOptions
): FurnitureGroup[] {
  // Lamps are excluded everywhere in this sheet so they only show once,
  // under "Chiroq" — including in swap mode.
  const visible = furniture.filter((f) => f.category !== "lampa");

  if (!isSwap) {
    const items = visible.filter(
      (f) => f.room_type === null || f.room_type === roomTypeKey
    );
    return items.length ? [{ key: "all", heading: null, items }] : [];
  }

  // No category signal (a scanned television, "other", …) — show everything,
  // exactly as before.
  if (!initialCategory) {
    return visible.length ? [{ key: "all", heading: null, items: visible }] : [];
  }

  const exact = visible.filter((f) => f.category === initialCategory);
  const related =
    initialCategory === SWAP_FALLBACK_CATEGORY
      ? []
      : visible.filter((f) => f.category === SWAP_FALLBACK_CATEGORY);

  const groups: FurnitureGroup[] = [];
  if (exact.length) groups.push({ key: "exact", heading: SWAP_EXACT_HEADING, items: exact });
  if (related.length) groups.push({ key: "related", heading: SWAP_RELATED_HEADING, items: related });

  // A lone exact-match group needs no heading — there's nothing to tell it
  // apart from. A lone "maybe" group keeps its heading, since the user does
  // need to know why none of these is an exact match.
  if (groups.length === 1 && groups[0].key === "exact") groups[0].heading = null;

  return groups;
}
