import type { AdminFurniture, AdminPlacement, AdminRoomType } from "@/lib/api";

export interface ModelFilterState {
  roomType: AdminRoomType | "";
  placement: AdminPlacement | "";
  minPrice: string;
  maxPrice: string;
}

export const EMPTY_MODEL_FILTERS: ModelFilterState = {
  roomType: "",
  placement: "",
  minPrice: "",
  maxPrice: "",
};

export function hasActiveFilters(filters: ModelFilterState): boolean {
  return filters.roomType !== "" || filters.placement !== "" || filters.minPrice !== "" || filters.maxPrice !== "";
}

/** Pure filter over an already-fetched model list — lists here are per-shop
 * or "unassigned only", small enough that a backend round trip per filter
 * change isn't worth it. */
export function filterModels(models: AdminFurniture[], filters: ModelFilterState): AdminFurniture[] {
  const min = filters.minPrice ? Number(filters.minPrice) : null;
  const max = filters.maxPrice ? Number(filters.maxPrice) : null;

  return models.filter((m) => {
    if (filters.roomType && m.room_type !== filters.roomType) return false;
    if (filters.placement && m.placement !== filters.placement) return false;
    // A price bound implies searching by price — an unpriced model can't match it.
    if (min !== null && (m.price_uzs == null || m.price_uzs < min)) return false;
    if (max !== null && (m.price_uzs == null || m.price_uzs > max)) return false;
    return true;
  });
}
