import type { ModerationStatus } from "@/lib/api";

export const STATUS_LABELS: Record<ModerationStatus, string> = {
  pending: "Ko'rib chiqilmoqda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
};

/** Tailwind classes for the little status pill. */
export const STATUS_STYLES: Record<ModerationStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};
