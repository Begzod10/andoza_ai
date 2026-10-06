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

// ---------- Shop inquiries ----------

export interface ShopInquiryData {
  furniture_id?: string;
  room_id?: string;
  message?: string;
}

export interface ShopInquiryResponse {
  id: string;
  store_id: string;
  furniture_id: string | null;
  room_id: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

/** A customer asks the shop that owns a catalog model about it. */
export async function createShopInquiry(storeId: string, data: ShopInquiryData): Promise<ShopInquiryResponse> {
  return apiClient<ShopInquiryResponse>(`/shops/${storeId}/inquiries`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
