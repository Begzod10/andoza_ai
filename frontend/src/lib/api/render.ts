import { apiClient } from "./client";

/** What the render task leaves in `result` once it is finished. */
export type RenderResult =
  | { status: "ok"; key: string; url: string }
  | { status: "failed"; error: string; request_id?: string };

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
export async function createRender(image: Blob, prompt?: string): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", image, "studio.jpg");
  if (prompt?.trim()) form.append("prompt", prompt.trim());
  return apiClient<{ job_id: string }>("/render", { method: "POST", body: form });
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

/** Poll a render job to the end. Resolves with the image URL; rejects with a
 *  readable message if the render failed or never finished. */
export async function waitForRender(jobId: string, signal?: AbortSignal): Promise<string> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const job = await getRenderJob(jobId);
    if (job.status === "SUCCESS" && job.result) {
      if (job.result.status === "ok") return job.result.url;
      throw new Error(job.result.error);
    }
    if (job.status === "FAILURE" || job.status === "REVOKED") throw new Error("Render bajarilmadi");
    await sleep(POLL_MS, signal);
  }
  throw new Error("Render juda uzoq davom etdi. Keyinroq qayta urinib ko'ring.");
}
