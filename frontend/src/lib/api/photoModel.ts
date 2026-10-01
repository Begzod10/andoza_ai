import { apiClient, BASE_URL, handleUnauthorized } from "./client";

/** The other angles of the same piece, next to the front photo. */
export type PhotoViews = { left?: Blob; back?: Blob; right?: Blob };

/** Queue a 3D model build. With only the photo it is built from that one; with
 *  other angles too, from all of them together (the server picks the endpoint).
 *  Returns the job to poll. */
export async function createPhotoModel(photo: Blob, views: PhotoViews = {}): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", photo, photo instanceof File ? photo.name : "photo.jpg");
  for (const [view, blob] of Object.entries(views)) {
    if (blob) form.append(view, blob, blob instanceof File ? blob.name : `${view}.jpg`);
  }
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
