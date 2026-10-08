import type { ModerationStatus } from "@/lib/api";

export const STATUS_LABELS: Record<ModerationStatus, string> = {
  pending: "Ko'rib chiqilmoqda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
};

/** Tailwind classes for the little status pill. */
export const STATUS_STYLES: Record<ModerationStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};
