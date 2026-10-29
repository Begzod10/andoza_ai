import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage, suggestMebelCabinets } from "@/lib/api";
import type { MebelSuggestion } from "@/lib/api";
import { newCabinet } from "@/features/mebel/engine";
import type { CabinetSpec, FurnitureProject } from "@/features/mebel/engine";
import { nextX } from "./layout";

/**
 * The AI's proposal applied to a project: added after the existing cabinets
 * or in their place, laid out along the wall like cabinets added by hand.
 * The AI gave parameters only; the engine works out every part from them.
 */
export function applySuggestion(project: FurnitureProject, s: MebelSuggestion, mode: "add" | "replace"): FurnitureProject {
  const cabinets: CabinetSpec[] = mode === "replace" ? [] : [...project.cabinets];
  let n = Math.max(0, ...cabinets.map((c) => Number(c.label.replace(/\D/g, "")) || 0));
  for (const sc of s.cabinets) {
    const cab: CabinetSpec = {
      ...newCabinet(`M${++n}`, nextX(cabinets, sc.type), sc.type),
      width: sc.width, height: sc.height, depth: sc.depth, shelves: sc.shelves,
    };
    if (sc.doors != null) cab.doors = sc.doors;
    if (sc.drawers > 0) cab.drawers = sc.drawers as CabinetSpec["drawers"];
    cabinets.push(cab);
  }
  const defaults = s.facade ? { ...project.defaults, facade: { ...project.defaults.facade, kind: s.facade, materialId: null } } : project.defaults;
  return { ...project, defaults, cabinets };
}

export function AiSuggest({ update }: { update: (fn: (p: FurnitureProject) => FurnitureProject) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<MebelSuggestion | null>(null);

  async function ask() {
    setBusy(true);
    setError("");
    try {
      setProposal(await suggestMebelCabinets(text.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const apply = (mode: "add" | "replace") => {
    if (!proposal) return;
    update((p) => applySuggestion(p, proposal, mode));
    setProposal(null);
    setText("");
  };
  const empty = !proposal || proposal.cabinets.length === 0;

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-blue-50/60 p-3">
      <label htmlFor="mebel-ai" className="text-sm font-bold text-neutral-900">{t("mebel.ai.label")}</label>
      <textarea id="mebel-ai" value={text} maxLength={1000} rows={3} onChange={(e) => setText(e.target.value)}
        placeholder={t("mebel.ai.placeholder")}
        className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm" />
      <button type="button" onClick={() => void ask()} disabled={busy || !text.trim()}
        className="self-start rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {busy ? t("mebel.ai.thinking") : t("mebel.ai.ask")}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {proposal && (
        <div className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm">
          {proposal.cabinets.length > 0 && (
            <ul className="flex flex-col gap-1">
              {proposal.cabinets.map((c, i) => (
                <li key={i} className="tabular-nums">
                  {`${t(`mebel.type.${c.type}`)} ${c.width}×${c.height}×${c.depth}`}
                  {c.drawers > 0 ? ` · ${t("mebel.drawers")}: ${c.drawers}` : ` · ${t("mebel.shelves")}: ${c.shelves}`}
                  {c.doors != null ? ` · ${t("mebel.doors")}: ${c.doors}` : ""}
                </li>
              ))}
            </ul>
          )}
          {proposal.questions.map((q) => <p key={q} className="text-xs text-amber-800">{q}</p>)}
          {proposal.dropped.length > 0 && (
            <p className="text-xs text-neutral-500">{`${t("mebel.ai.dropped")}: ${proposal.dropped.join("; ")}`}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => apply("add")} disabled={empty}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{t("mebel.ai.add")}</button>
            <button type="button" onClick={() => apply("replace")} disabled={empty}
              className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-40">{t("mebel.ai.replace")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
