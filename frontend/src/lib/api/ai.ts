import { apiClient, BASE_URL, handleUnauthorized, languageHeaders } from "./client";
import type { CeilingDesignId, CeilingSettings } from "@/lib/ceilingDesigns";
import type { TrimState } from "@/lib/trimProfiles";

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
export interface DesignTrim {
  ceiling: { design: CeilingDesignId; settings?: Partial<CeilingSettings> };
  skirting: TrimState;
  cornice: TrimState | null;
}

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
  /** Ready-made styles only: the ceiling profile, the skirting and the cornice (null takes one
   *  off). The AI designer does not send it, so its plans leave all three as they are. */
  trim?: DesignTrim;
  /** What the server dropped from the model's answer (an invented id, a bad colour). */
  warnings: string[];
  /** Image designs only: what the picture had and what the catalog lacked. */
  image_notes?: string;
  /** Pin designs only: the pin's picture the design was made from. */
  pin_image_url?: string;
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
    headers: { "Content-Type": "application/json", ...languageHeaders() },
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

/** The same plan as aiDesign, styled after an inspiration image (a Pinterest screenshot,
 *  a photo of a room). The prompt is optional and refines it ("faqat ranglarini ol"). */
export async function aiDesignFromImage(
  roomId: string, image: File, prompt?: string, roomType?: string,
): Promise<AiDesignPlan> {
  const form = new FormData();
  form.append("image", image);
  if (prompt?.trim()) form.append("prompt", prompt.trim());
  if (roomType) form.append("room_type", roomType);
  return apiClient<AiDesignPlan>(`/rooms/${roomId}/ai-design/image`, { method: "POST", body: form });
}

/** A quick check before sending: https and a Pinterest host (pin.it, *.pinterest.*).
 *  The server checks properly; this only spares a request for an obvious mistake. */
export function looksLikePinUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    const host = url.hostname.replace(/\.$/, "").toLowerCase();
    return url.protocol === "https:" && (host === "pin.it" || /(^|\.)pinterest\.[a-z.]+$/.test(host));
  } catch {
    return false;
  }
}

/** The pin link inside a pasted text, e.g. Pinterest's share text
 *  "Check out this Pin! https://pin.it/AbCd12", or null when there is none. */
export function findPinUrl(text: string): string | null {
  return text.match(/https:\/\/\S+/g)?.find(looksLikePinUrl) ?? null;
}

/** The pin link handed to the studio as `?ai_pin=…`, or null. The mobile app opens
 *  the studio this way after a pin is shared to it from the Pinterest app; the value
 *  may be the whole share text ("Check out this Pin! https://pin.it/…"). */
export function pinParam(search: string): string | null {
  const raw = new URLSearchParams(search).get("ai_pin");
  return raw ? findPinUrl(raw) : null;
}

/** The same plan as aiDesign, styled after a Pinterest pin. The server fetches the
 *  pin's picture; the answer says which one in pin_image_url. */
export async function aiDesignFromPin(
  roomId: string, url: string, prompt?: string, roomType?: string,
): Promise<AiDesignPlan> {
  return apiClient<AiDesignPlan>(`/rooms/${roomId}/ai-design/pin`, {
    method: "POST",
    body: JSON.stringify({ url, prompt: prompt?.trim() || null, room_type: roomType ?? null }),
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
