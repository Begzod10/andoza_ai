import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import type { Part } from "@/features/mebel/engine";
import { formatBand } from "./format";

/** Every hole of a part: kind, face, position, diameter and depth (0 = through). */
export function HoleTable({ part, print = false }: { part: Part; print?: boolean }) {
  const { t } = useTranslation();
  const cell = print ? "border border-black px-2 py-1" : "px-2 py-1.5";
  return (
    <table aria-label={t("mebel.drill.holes")} className="w-full text-left text-sm">
      <thead className="text-xs text-neutral-500">
        <tr>
          <th className={cell}>{t("mebel.drill.kind")}</th>
          <th className={cell}>{t("mebel.drill.face")}</th>
          <th className={`${cell} text-right`}>u</th>
          <th className={`${cell} text-right`}>v</th>
          <th className={`${cell} text-right`}>Ø</th>
          <th className={`${cell} text-right`}>{t("mebel.drill.depth")}</th>
        </tr>
      </thead>
      <tbody>
        {(part.holes ?? []).map((h, i) => (
          <tr key={i} className={print ? "" : "border-t border-neutral-100"}>
            <td className={cell}>{t(`mebel.drill.kinds.${h.kind}` as TKey)}</td>
            <td className={cell}>{h.face}</td>
            <td className={`${cell} text-right tabular-nums`}>{formatBand(h.u)}</td>
            <td className={`${cell} text-right tabular-nums`}>{formatBand(h.v)}</td>
            <td className={`${cell} text-right tabular-nums`}>{formatBand(h.diameter)}</td>
            <td className={`${cell} text-right tabular-nums`}>{h.depth === 0 ? t("mebel.drill.through") : h.depth}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
