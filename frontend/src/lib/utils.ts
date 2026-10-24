import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { currentLanguage, intlLocale, type Language } from "@/i18n";

/**
 * Merge Tailwind CSS class names with clsx support.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Digit-group separator per language: a thin space U+2009 (uz, as it always was), a plain space (ru) or a comma (en). */
const GROUP_SEPARATOR: Record<Language, string> = { uz: "\u2009", ru: " ", en: "," };

function groupDigits(whole: number, language: Language): string {
  return Math.trunc(whole)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR[language]);
}

/**
 * Format a soʻm amount as human-readable UZS currency, in the interface
 * language: "1 240 000 soʻm" (uz), "1 240 000 сум" (ru), "1,240,000 UZS" (en).
 * Separators are written out (plain spaces, never the NBSP that Intl uses for
 * ru) so the text wraps and compares the same everywhere.
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
  const language = currentLanguage();
  return `${groupDigits(soum, language)} ${CURRENCY[language]}`;
}

const CURRENCY: Record<Language, string> = { uz: "soʻm", ru: "сум", en: "UZS" };

/**
 * Format a so'm amount as USD, converted at *usdRate* so'm-per-1-USD (from
 * EstimateResponse.usd_rate — the live CBU rate the backend priced against).
 * Example: formatUSDFromUZS(124000000, 12750) -> "$9 725". Below $100 it keeps
 * the cents (9 500 so'm -> "$0.80"): rounded to whole dollars, a unit price
 * turned into a different number and its line stopped adding up.
 */
export function formatUSDFromUZS(soum: number, usdRate: number): string {
  if (!usdRate) return "$0";
  const usd = soum / usdRate;
  if (Math.abs(usd) < 99.995) return `$${usd.toFixed(2)}`;
  const formatted = Math.round(usd).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `$${formatted}`;
}

/**
 * Format a so'm amount compactly for tight spaces (a nav-tab badge, a
 * running-total chip) where formatUZS's full digit string doesn't fit.
 * uz: 60_987_000 -> "61 mln so'm", 850_000 -> "850 ming so'm";
 * ru: "61 млн сум", "850 тыс. сум"; en: "61M UZS", "850K UZS".
 * Below 1 000 it falls back to formatUZS.
 */
export function formatUZSCompact(soum: number): string {
  const language = currentLanguage();
  const abs = Math.abs(soum);
  if (abs >= 1_000_000) {
    const millions = Math.round((soum / 1_000_000) * 10) / 10;
    const rounded = Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1);
    if (language === "ru") return `${rounded.replace(".", ",")} млн сум`;
    if (language === "en") return `${rounded}M UZS`;
    return `${rounded} mln so'm`;
  }
  if (abs >= 1_000) {
    const thousands = Math.round(soum / 1_000);
    if (language === "ru") return `${thousands} тыс. сум`;
    if (language === "en") return `${thousands}K UZS`;
    return `${thousands} ming so'm`;
  }
  return formatUZS(soum);
}

/**
 * A number shown to the reader with a fixed count of decimals: ru writes the
 * decimal comma ("2,50"), en the dot. uz keeps the dot it always showed (Intl's
 * uz-UZ would write a comma). Never grouped. Text only: a value an <input>
 * parses back stays `toFixed`.
 */
export function formatDecimal(value: number, digits: number): string {
  if (currentLanguage() === "uz") return value.toFixed(digits);
  return value.toLocaleString(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
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
