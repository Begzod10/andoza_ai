import { apiClient } from "./client";

// ---------- Store types ----------

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
}

// ---------- Stores ----------

export async function getStores(): Promise<Store[]> {
  return apiClient<Store[]>("/stores");
}
