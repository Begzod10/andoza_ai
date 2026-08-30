import type { AdminFurnitureCategory, AdminPlacement, AdminRoomType } from "@/lib/api";

export const CATEGORY_LABELS: Record<AdminFurnitureCategory, string> = {
  divan: "Divan",
  stol: "Stol",
  stul: "Stul",
  karavot: "Karavot",
  shkaf: "Shkaf",
  lampa: "Lampa",
  boshqa: "Boshqa",
};

export const ROOM_TYPE_LABELS: Record<AdminRoomType, string> = {
  mehmonxona: "Mehmonxona",
  oshxona: "Oshxona",
  yotoqxona: "Yotoqxona",
  hammom: "Hammom",
  balkon: "Balkon",
};

/** Where the model sits once placed in a room. */
export const PLACEMENT_LABELS: Record<AdminPlacement, string> = {
  pol: "Polda",
  devor: "Devorda",
  shift: "Shiftda",
};
