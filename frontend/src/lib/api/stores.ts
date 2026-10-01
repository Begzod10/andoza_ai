import { apiClient } from "./client";

// ---------- Store types ----------

/** A public shop, as GET /stores returns it (the backend's StoreOut). */
export interface Store {
  id: string;
  name: string;
  district: string | null;
  phone: string | null;
  telegram: string | null;
  logo_color: string | null;
  partner_tier: string;
}

// ---------- Stores ----------

export async function getStores(): Promise<Store[]> {
  return apiClient<Store[]>("/stores");
}
