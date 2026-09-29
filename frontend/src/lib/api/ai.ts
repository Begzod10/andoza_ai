import { apiClient, BASE_URL, handleUnauthorized } from "./client";

// ---------- AI types ----------

export type AiBuildEventType = "thinking" | "tool_call" | "tool_result" | "done" | "error";

export interface AiBuildEvent {
  type: AiBuildEventType;
  text?: string;
  name?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  result?: string;
  summary?: string;
  patch?: AiRoomPatch;
  message?: string;
}

export interface AiRoomPatch {
  ceiling_h?: number;
  wall_lengths?: Record<string, number>;
  surfaces?: Record<string, string>;
  material_colors?: Record<string, string>;
  furniture?: Array<{
    id: string;
    furniture_id: string;
    x: number;
    y: number;
    rotation: number;
  }>;
}

export interface SmetaAskResponse {
  answer_uz: string;
  related_line_ids: string[];
}

// ---------- AI endpoints ----------

export async function* aiBuildStream(
  roomId: string,
  prompt: string
): AsyncGenerator<AiBuildEvent> {
  const response = await fetch(`${BASE_URL}/rooms/${roomId}/ai-build`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (response.status === 401) handleUnauthorized();
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.startsWith("data: ")) {
        try {
          yield JSON.parse(part.slice(6)) as AiBuildEvent;
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

export async function smetaAsk(
  roomId: string,
  question: string
): Promise<SmetaAskResponse> {
  return apiClient<SmetaAskResponse>(`/rooms/${roomId}/smeta/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}
