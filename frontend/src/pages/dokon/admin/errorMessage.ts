import { GATEWAY_DOWN, isGatewayError } from "@/lib/gatewayError";

/** A readable message for an error: the server's own, or `fallback`. A gateway
 *  failure (nginx's HTML 502 page, a dropped connection) gets a plain sentence
 *  rather than the page's markup. */
export function errorMessage(err: unknown, fallback: string): string {
  if (isGatewayError(err)) return GATEWAY_DOWN;
  return err instanceof Error && err.message ? err.message : fallback;
}
