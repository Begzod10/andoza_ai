import { apiClient } from "./client";

// ---------- Usta types ----------

export interface Usta {
  id: string;
  name: string;
  phone: string;
  telegram: string | null;
  category: string;
  district: string;
  rating: number;
  jobs_count: number;
  price_min: number;
  price_max: number;
  verified: boolean;
  avatar_url?: string | null;
}

export interface UstalarParams {
  specialization?: string;
  region?: string;
  sort?: "rating" | "price_asc" | "price_desc";
  page?: number;
  page_size?: number;
}

// ---------- Ustalar ----------

export async function getUstalar(params: UstalarParams = {}): Promise<Usta[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return apiClient<Usta[]>(`/ustalar${query ? `?${query}` : ""}`);
}
