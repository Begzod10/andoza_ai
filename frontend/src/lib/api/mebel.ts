import { apiClient } from "./client";
import { EMPTY_PRICE_BOOK } from "@/features/mebel/engine";
import type { FurnitureProject, PriceBook } from "@/features/mebel/engine";

/** The /mebel mini-app's storage: projects and the workshop's price book. */
export interface MebelProjectSummary {
  id: string;
  name: string;
  updated_at: string;
}

export interface MebelProject {
  id: string;
  name: string;
  data: FurnitureProject;
}

export function listMebelProjects(): Promise<MebelProjectSummary[]> {
  return apiClient<MebelProjectSummary[]>("/mebel/projects");
}

export function getMebelProject(id: string): Promise<MebelProject> {
  return apiClient<MebelProject>(`/mebel/projects/${encodeURIComponent(id)}`);
}

export function createMebelProject(name: string, data: FurnitureProject): Promise<MebelProject> {
  return apiClient<MebelProject>("/mebel/projects", { method: "POST", body: JSON.stringify({ name, data }) });
}

export function saveMebelProject(id: string, name: string, data: FurnitureProject): Promise<MebelProject> {
  return apiClient<MebelProject>(`/mebel/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name, data }),
  });
}

export async function deleteMebelProject(id: string): Promise<void> {
  await apiClient<void>(`/mebel/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** The saved price book over the empty one, so a field added later has a value. */
export async function getPriceBook(): Promise<PriceBook> {
  const saved = await apiClient<Partial<PriceBook>>("/mebel/price-book");
  return {
    ...EMPTY_PRICE_BOOK,
    ...saved,
    bandingPerMeter: { ...EMPTY_PRICE_BOOK.bandingPerMeter, ...saved.bandingPerMeter },
    hardware: { ...EMPTY_PRICE_BOOK.hardware, ...saved.hardware },
  };
}

export function savePriceBook(pb: PriceBook): Promise<PriceBook> {
  return apiClient<PriceBook>("/mebel/price-book", { method: "PUT", body: JSON.stringify({ data: pb }) });
}
