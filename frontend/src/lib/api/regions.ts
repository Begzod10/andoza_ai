import { apiClient } from "./client";

// ---------- Regions (viloyat/tuman reference data) ----------

export interface Region {
  name: string;
  code: string;
  districts: string[];
}

/** O'zbekiston viloyatlari va ularning tumanlari — static list, no auth needed. */
export async function listRegions(): Promise<Region[]> {
  return apiClient<Region[]>("/regions");
}
