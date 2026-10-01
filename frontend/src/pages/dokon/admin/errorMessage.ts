import { GATEWAY_DOWN, isGatewayError } from "@/lib/gatewayError";

/** A readable message for an error: the server's own, or `fallback`. The API
 *  answers `{"detail": "..."}` and apiClient throws that body as text, so the
 *  sentence is taken out of it; a gateway failure (nginx's HTML 502 page, a
 *  dropped connection) gets a plain sentence rather than the page's markup. */
export function errorMessage(err: unknown, fallback: string): string {
  if (isGatewayError(err)) return GATEWAY_DOWN;
  if (!(err instanceof Error) || !err.message) return fallback;
  try {
    const detail = JSON.parse(err.message)?.detail;
    if (typeof detail === "string" && detail) return detail;
  } catch {
    /* not JSON — show it as it came */
  }
  return err.message;
}
