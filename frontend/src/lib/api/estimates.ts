import { apiClient, BASE_URL, handleUnauthorized } from "./client";

// ---------- Estimate types ----------

export interface EstimateLine {
  label: string;
  formula: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_uzs: number;
  is_approximate: boolean;
  store_id: string | null;
  category?: string;
  /** Why this line is approximate/incomplete, e.g. "Material tanlanmagan —
   * taxminiy narx ishlatildi" or an AI-estimated price's builder note.
   * Previously computed but never sent past the PDF export. */
  warning?: string | null;
}

export interface EstimateResponse {
  id: string;
  room_id: string;
  lines: EstimateLine[];
  /** Full expected spend: total_exact_uzs + total_approx_uzs combined. */
  total_uzs: number;
  /** Sum of lines NOT flagged is_approximate — backed by a real catalog price. */
  total_exact_uzs: number;
  /** Sum of lines flagged is_approximate (fallback pricing, missing norm, ...). */
  total_approx_uzs: number;
  total_min: number;
  total_max: number;
  created_at: string;
  /** An electrical line is always present — this is nearly always true. */
  has_electrical: boolean;
  /** Whether has_electrical is backed by real placed point counts rather
   *  than the fallback default guess. */
  electrical_confirmed: boolean;
  /** so'm-per-1-USD this estimate was converted at (live CBU rate, cached ~1h). */
  usd_rate: number;
  total_usd: number;
}

// ---------- Estimate ----------

export async function createEstimate(
  roomId: string
): Promise<EstimateResponse> {
  return apiClient<EstimateResponse>(`/rooms/${roomId}/estimate`, {
    method: "POST",
  });
}

export async function previewEstimate(roomId: string): Promise<EstimateResponse> {
  return apiClient<EstimateResponse>(`/rooms/${roomId}/estimate/preview`, { method: "POST" });
}

export async function getEstimatePDF(roomId: string): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/rooms/${roomId}/estimate/pdf`, {
    credentials: "include",
    headers: { Accept: "application/pdf" },
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}
