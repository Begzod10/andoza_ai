import type { ModerationStatus } from "@/lib/api";
import { STATUS_LABELS, STATUS_STYLES } from "./statusLabels";

export function StatusBadge({ status }: { status: ModerationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
