import { apiClient } from "./client";

// ---------- Meshy types ----------

export interface ConvertImageTo3DRequest {
  image_url: string;
  enable_pbr?: boolean;
  wait_for_completion?: boolean;
}

export interface ConvertImageTo3DResponse {
  task_id: string;
  status: string; // 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  model_urls: Record<string, string>;
  message: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: string;
  model_urls: Record<string, string>;
  error: string;
}

// ---------- Meshy endpoints ----------

export async function convertImageTo3D(
  req: ConvertImageTo3DRequest
): Promise<ConvertImageTo3DResponse> {
  const MESHY_BASE_URL = "/api/meshy"; // Direct path without /api/v1 prefix
  return apiClient<ConvertImageTo3DResponse>(`${MESHY_BASE_URL}/convert`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getMeshyTaskStatus(
  taskId: string
): Promise<TaskStatusResponse> {
  const MESHY_BASE_URL = "/api/meshy";
  return apiClient<TaskStatusResponse>(`${MESHY_BASE_URL}/task/${taskId}`, {
    method: "GET",
  });
}

export async function waitForMeshyTask(
  taskId: string
): Promise<ConvertImageTo3DResponse> {
  const MESHY_BASE_URL = "/api/meshy";
  return apiClient<ConvertImageTo3DResponse>(`${MESHY_BASE_URL}/wait/${taskId}`, {
    method: "POST",
  });
}
