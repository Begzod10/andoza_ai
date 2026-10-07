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

/** One piece of an AI design's plan: the model chose WHAT, and a zone for roughly WHERE. */
export interface AiDesignPlan {
  title: string;
  summary: string;
  walls: {
    main?:
      | { type: "paint"; color: string }
      | { type: "oboy"; pattern: string; base_color: string; accent_color: string };
    accent?: { wall: string; color: string };
  };
  floor: { type: string; pattern: string | null; tint: string | null } | null;
  lights: Array<{ type: string; zone: string }>;
  furniture: Array<{ id: string; name: string; zone: string }>;
  /** What the server dropped from the model's answer (an invented id, a bad colour). */
  warnings: string[];
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

/** A whole-room design from one sentence. The plan is only a proposal: nothing is changed until the studio applies it. */
export async function aiDesign(roomId: string, prompt: string, roomType?: string): Promise<AiDesignPlan> {
  return apiClient<AiDesignPlan>(`/rooms/${roomId}/ai-design`, {
    method: "POST",
    body: JSON.stringify({ prompt, room_type: roomType ?? null }),
  });
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
