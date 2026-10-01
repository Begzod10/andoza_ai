import { apiClient, BASE_URL, handleUnauthorized } from "./client";

/** Queue a 3D model build from a furniture photo. Returns the job to poll. */
export async function createPhotoModel(photo: Blob): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", photo, photo instanceof File ? photo.name : "photo.jpg");
  return apiClient<{ job_id: string }>("/models/from-photo", { method: "POST", body: form });
}

/** The finished GLB, fetched through the API (same-origin, with the cookie) so it
 *  does not depend on the storage host's CORS rules. */
export async function fetchPhotoModelGlb(key: string): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/models/from-photo/glb?key=${encodeURIComponent(key)}`, {
    credentials: "include",
  });
  if (response.status === 401) handleUnauthorized();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}
