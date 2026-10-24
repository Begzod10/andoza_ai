import { useTranslation } from "react-i18next";
import type { ModerationStatus } from "@/lib/api";
import { STATUS_KEYS, STATUS_STYLES } from "./statusLabels";

export function StatusBadge({ status }: { status: ModerationStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLES[status]}`}>
      {t(STATUS_KEYS[status])}
    </span>
  );
}
