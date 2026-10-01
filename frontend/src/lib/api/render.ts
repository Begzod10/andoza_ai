import { apiClient } from "./client";

/** What the render task leaves in `result` once it is finished. */
export type RenderResult =
  | { status: "ok"; key: string; url: string; prompt?: string | null; lighting?: string }
  | { status: "failed"; error: string; request_id?: string | number };

/** The interior lighting moods a finished render can be relit with. */
export const LIGHTING_MOODS = [
  "midday_light",
  "golden_light",
  "blue_hour_light",
  "ambient_light",
  "warm_lamps",
  "dimmed_mood",
] as const;
export type LightingMood = (typeof LIGHTING_MOODS)[number];

/** A finished render: where to see it, the storage key to relight it from, and
 *  the prompt it was made with (the generated one, when the user wrote none). */
export interface RenderOutcome {
  url: string;
  key: string;
  prompt: string | null;
}

interface JobStatus {
  job_id: string;
  /** Celery's state: PENDING | STARTED | SUCCESS | FAILURE | ... */
  status: string;
  result: RenderResult | null;
}

/** The backend answers errors as `{"detail": "..."}`; apiClient throws the raw body. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const detail = JSON.parse(raw)?.detail;
    if (typeof detail === "string") return detail;
  } catch {
    /* not JSON — show it as it came */
  }
  return raw;
}

/** Queue a render of a captured studio screenshot. Returns the job to poll. */
export async function createRender(image: Blob, prompt?: string, roomId?: string): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", image, "studio.jpg");
  if (prompt?.trim()) form.append("prompt", prompt.trim());
  if (roomId) form.append("room_id", roomId);
  return apiClient<{ job_id: string }>("/render", { method: "POST", body: form });
}

/** Queue a relit copy of a finished render. Returns the job to poll. */
export async function createRelight(renderKey: string, lighting: LightingMood): Promise<{ job_id: string }> {
  return apiClient<{ job_id: string }>("/render/relight", {
    method: "POST",
    body: JSON.stringify({ render_key: renderKey, lighting }),
  });
}

/** Queue a 4K copy (3840 px on the long side) of a finished render. Returns the job to poll. */
export async function createUpscale(renderKey: string): Promise<{ job_id: string }> {
  return apiClient<{ job_id: string }>("/render/upscale", {
    method: "POST",
    body: JSON.stringify({ render_key: renderKey }),
  });
}

/** A render kept in the database: the first picture, or a relit / 4K copy of one. */
export interface SavedRender {
  id: string;
  key: string;
  url: string;
  kind: "render" | "relight" | "upscale";
  lighting: string | null;
  prompt: string | null;
  panorama: boolean;
  parent_key: string | null;
  room_id: string | null;
  created_at: string;
}

/** The caller's saved renders of a room, newest first. */
export async function listRenders(roomId: string): Promise<SavedRender[]> {
  return apiClient<SavedRender[]>(`/renders?room_id=${encodeURIComponent(roomId)}`);
}

export async function deleteRender(id: string): Promise<void> {
  await apiClient<void>(`/renders/${id}`, { method: "DELETE" });
}

export async function getRenderJob(jobId: string): Promise<JobStatus> {
  return apiClient<JobStatus>(`/jobs/${jobId}`);
}

const POLL_MS = 3000;
// A render takes ~13 s; this is generous for a queue backlog without spinning forever.
const MAX_POLLS = 80;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** Poll a render job to the end. Resolves with the finished render; rejects
 *  with a readable message if it failed or never finished. */
export async function waitForRender(jobId: string, signal?: AbortSignal): Promise<RenderOutcome> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const job = await getRenderJob(jobId);
    if (job.status === "SUCCESS" && job.result) {
      if (job.result.status === "ok") {
        return { url: job.result.url, key: job.result.key, prompt: job.result.prompt ?? null };
      }
      throw new Error(job.result.error);
    }
    if (job.status === "FAILURE" || job.status === "REVOKED") throw new Error("Render bajarilmadi");
    await sleep(POLL_MS, signal);
  }
  throw new Error("Render juda uzoq davom etdi. Keyinroq qayta urinib ko'ring.");
}
