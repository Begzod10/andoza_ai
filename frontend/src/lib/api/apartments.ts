import { apiClient } from "./client";

// ---------- Apartment types ----------

export interface Apartment {
  id: string;
  name: string;
  address: string | null;
  developer: string | null;
  created_at: string;
  rooms?: ApartmentRoom[];
}

export interface ApartmentRoom {
  id: string;
  name: string;
  floor_area: number | null;
  thumbnail_url?: string | null;
}

export interface CreateApartmentData {
  name: string;
  address?: string;
  developer?: string;
}

// ---------- Apartments ----------

export async function getApartments(includeDeleted: boolean = false): Promise<Apartment[]> {
  const url = `/apartments${includeDeleted ? "?include_deleted=true" : ""}`;
  return apiClient<Apartment[]>(url);
}

export async function createApartment(
  data: CreateApartmentData
): Promise<Apartment> {
  return apiClient<Apartment>("/apartments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
