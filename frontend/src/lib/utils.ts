import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS class names with clsx support.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a soʻm amount as human-readable UZS currency.
 * Example: 1240000 -> "1 240 000 soʻm"
 *
 * Despite the old name/docstring, every real caller (SmetaPage.tsx, fed by
 * ComputedLine.unit_price_uzs/subtotal_uzs and ComputedEstimate.total_uzs
 * from the backend's smeta engine) already passes whole soʻm, not tiyin —
 * confirmed directly against app/services/smeta.py's _make_line, which
 * does its own internal tiyin arithmetic but returns the result divided
 * back down to soʻm. The /100 here was silently showing every price on
 * the Smeta page 100x too low.
 */
export function formatUZS(soum: number): string {
  const formatted = Math.trunc(soum)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " "); // thin space
  return `${formatted} soʻm`;
}

/**
 * Format area in square metres.
 * Example: 12.4 -> "12.4 m²"
 */
export function formatArea(m2: number): string {
  const rounded = Math.round(m2 * 10) / 10;
  return `${rounded} m²`;
}

/**
 * Clamp a value between min and max (inclusive).
 */
export function clampValue(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
