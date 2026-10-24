import type { TKey } from "@/i18n";
import type { ModerationStatus } from "@/lib/api";

export const STATUS_KEYS: Record<ModerationStatus, TKey> = {
  pending: "dokon.status.pending",
  approved: "dokon.status.approved",
  rejected: "dokon.status.rejected",
};

/** Tailwind classes for the little status pill. */
export const STATUS_STYLES: Record<ModerationStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};
