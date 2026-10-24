import type { TFunction } from "i18next";
import type { TKey } from "@/i18n";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

/**
 * A form's error as component state. A message the app wrote itself is held as
 * its key (+ values) and translated while rendering, so it follows a language
 * change; text that came from the server stays as received.
 */
export type FormError = { key: TKey; values?: Record<string, unknown> } | string | null;

export function localError(key: TKey, values?: Record<string, unknown>): FormError {
  return { key, values };
}

/** The sentence to show for a stored error (call while rendering). */
export function formErrorText(t: TFunction, error: FormError): string | null {
  if (error === null) return null;
  if (typeof error === "string") return error;
  return t(error.key, error.values) as string;
}

/** The server's own message when there is one, else the app's `fallbackKey`. */
export function requestError(err: unknown, fallbackKey: TKey): FormError {
  const marker = "\u0000fallback";
  const message = errorMessage(err, marker);
  return message === marker ? { key: fallbackKey } : message;
}
