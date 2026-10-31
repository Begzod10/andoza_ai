import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Part } from "@/features/mebel/engine";
import { AssemblyDrawing } from "./AssemblyDrawing";
import { HoleTable } from "./HoleTable";
import { PartDrawing } from "./PartDrawing";
import { partName } from "./format";

/** The drilling map: the drilled parts, the chosen one drawn with its holes, and each cabinet's assembly drawing. */
export function DrillingPanel({
  parts, cabinets, selectedPartId = null,
}: { parts: Part[]; cabinets: { id: string; label: string }[]; selectedPartId?: string | null }) {
  const { t } = useTranslation();
  const drilled = parts.filter((p) => (p.holes ?? []).length > 0);
  const [chosen, setChosen] = useState<string | null>(null);
  if (drilled.length === 0) return <p className="text-sm text-neutral-500">{t("mebel.drill.empty")}</p>;
  // the part chosen here, else the one selected elsewhere (3D, a table, a label's QR code)
  const part = drilled.find((p) => p.id === (chosen ?? selectedPartId)) ?? drilled[0];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <ul className="flex shrink-0 flex-col gap-1 md:w-56">
          {drilled.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setChosen(p.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${p.id === part.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}>
                {`${p.id} · ${partName(p.role)} · ${t("mebel.drill.count", { n: p.holes!.length })}`}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <PartDrawing part={part} />
          <HoleTable part={part} />
        </div>
      </div>
      {cabinets.map((c) => (
        <AssemblyDrawing key={c.id} label={c.label} parts={parts.filter((p) => p.cabinetId === c.id)} />
      ))}
    </div>
  );
}
