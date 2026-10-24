import type { TFunction } from "i18next";
import type { TKey } from "@/i18n";
import type { AdminFurnitureCategory, AdminPlacement, AdminRoomType } from "@/lib/api";

export const CATEGORY_KEYS: Record<AdminFurnitureCategory, TKey> = {
  divan: "studio.lib.category.divan",
  stol: "studio.lib.category.stol",
  stul: "studio.lib.category.stul",
  karavot: "studio.lib.category.karavot",
  shkaf: "studio.lib.category.shkaf",
  lampa: "studio.lib.category.lampa",
  boshqa: "studio.lib.category.boshqa",
};

export const ROOM_TYPE_KEYS: Record<AdminRoomType, TKey> = {
  mehmonxona: "dokon.admin.room_type.mehmonxona",
  oshxona: "dokon.admin.room_type.oshxona",
  yotoqxona: "dokon.admin.room_type.yotoqxona",
  hammom: "dokon.admin.room_type.hammom",
  balkon: "dokon.admin.room_type.balkon",
};

/** Where the model sits once placed in a room. */
export const PLACEMENT_KEYS: Record<AdminPlacement, TKey> = {
  pol: "studio.lib.placement.pol",
  devor: "studio.lib.placement.devor",
  shift: "studio.lib.placement.shift",
};

// The server may send a value this build does not know: it is shown as it came.
export function categoryLabel(value: string, t: TFunction): string {
  return value in CATEGORY_KEYS ? t(CATEGORY_KEYS[value as AdminFurnitureCategory]) : value;
}
export function roomTypeLabel(value: string, t: TFunction): string {
  return value in ROOM_TYPE_KEYS ? t(ROOM_TYPE_KEYS[value as AdminRoomType]) : value;
}
export function placementLabel(value: string, t: TFunction): string {
  return value in PLACEMENT_KEYS ? t(PLACEMENT_KEYS[value as AdminPlacement]) : value;
}
