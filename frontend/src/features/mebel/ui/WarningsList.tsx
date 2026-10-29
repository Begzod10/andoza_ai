import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import type { Warning } from "@/features/mebel/engine";

export function WarningsList({ warnings, labelOf }: { warnings: Warning[]; labelOf(cabinetId?: string): string | null }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return <p className="text-sm text-neutral-500">{t("mebel.no_warnings")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((w, i) => (
        <li key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {labelOf(w.cabinetId) ? <span className="mr-1 font-semibold">{labelOf(w.cabinetId)}:</span> : null}
          {t(`mebel.warning.${w.code}` as TKey, w.params)}
        </li>
      ))}
    </ul>
  );
}
