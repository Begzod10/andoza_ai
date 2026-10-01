/** A reply from the proxy in front of the API (nginx's 502 page) or no reply at all —
 *  what a deploy restart or a dropped connection looks like. Says nothing about the job. */
export function isGatewayError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch itself failed: offline, reset, DNS
  const raw = err instanceof Error ? err.message : String(err);
  return /^\s*</.test(raw) || /\b50[234]\b/.test(raw);
}

export const GATEWAY_DOWN = "Server vaqtincha javob bermayapti. Birozdan so'ng qayta urinib ko'ring.";
