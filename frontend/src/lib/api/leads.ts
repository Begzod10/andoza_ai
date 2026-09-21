import { apiClient } from "./client";

// ---------- Lead types ----------

export interface LeadData {
  usta_id: string;
  room_id?: string;
  message?: string;
  contact_phone?: string;
}

export interface LeadResponse {
  id: string;
  status: string;
  created_at: string;
}

// ---------- Lead ----------

export async function createLead(data: LeadData): Promise<LeadResponse> {
  return apiClient<LeadResponse>("/leads", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
