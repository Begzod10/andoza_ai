import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { TKey } from "@/i18n";
import { newCabinet } from "@/features/mebel/engine";
import { nextX, relayout } from "./layout";
import type { CabinetSpec, ConstructionDefaults, EdgeBandRef, FurnitureProject, Warning } from "@/features/mebel/engine";

export interface CatalogOption { id: string; name: string }
export interface CatalogOptions { ldsp: CatalogOption[]; hdf: CatalogOption[]; kromka: CatalogOption[]; mdf: CatalogOption[] }

type Update = (fn: (p: FurnitureProject) => FurnitureProject) => void

/** The field each validation error belongs to, so that field is marked. */
export const ERROR_FIELD: Record<string, keyof CabinetSpec> = {
  width_range: "width", inner_width: "width", height_range: "height",
  depth_range: "depth", shelf_depth: "depth", shelves_range: "shelves",
  drawers_range: "drawers", drawers_type: "drawers", drawer_low: "drawers", drawer_shallow: "drawers",
  position_range: "position",
};

const summary = "flex cursor-pointer list-none items-center justify-between text-sm font-bold text-neutral-900";

/** Turns when its <details> opens. */
function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180">
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const invalidField = "border-red-400 bg-red-50";

function NumField({
  id, label, value, onChange, error, disabled,
}: { id: string; label: string; value: number; onChange(v: number): void; error?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-500">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        className={`${field} ${error ? invalidField : ""}`}
      />
      {error && <p id={`${id}-err`} className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Select<T extends string | number>({
  id, label, value, options, onChange, disabled, error,
}: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled?: boolean; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-500">{label}</label>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
        className={`${field} ${error ? invalidField : ""}`}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      {error && <p id={`${id}-err`} className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function MaterialSelect({
  id, label, value, options, onChange,
}: { id: string; label: string; value: string | null; options: CatalogOption[]; onChange(v: string | null): void }) {
  const { t } = useTranslation();
  return (
    <Select
      id={id}
      label={label}
      value={value ?? ""}
      options={[{ value: "", label: t("mebel.no_material") }, ...options.map((o) => ({ value: o.id, label: o.name }))]}
      onChange={(v) => onChange(v === "" ? null : v)}
    />
  );
}

/** Project settings (construction defaults) and the cabinets with their sizes. */
export function ParamsPanel({
  project, update, errors, catalog, focusCabinetId = null,
}: {
  project: FurnitureProject; update: Update; errors: Warning[]; catalog: CatalogOptions
  /** The cabinet of the part selected in the 3D view or a table: its row opens. */
  focusCabinetId?: string | null
}) {
  const { t } = useTranslation();
  // One cabinet row open at a time; a new one opens as it is added.
  const [openId, setOpenId] = useState<string | null>(project.cabinets[0]?.id ?? null);
  useEffect(() => {
    if (focusCabinetId) setOpenId(focusCabinetId);
  }, [focusCabinetId]);
  const d = project.defaults;
  const setDefaults = (patch: (d: ConstructionDefaults) => ConstructionDefaults) =>
    update((p) => ({ ...p, defaults: patch(p.defaults) }));
  const setBand = (which: "visible" | "hidden", patch: Partial<EdgeBandRef>) =>
    setDefaults((x) => ({ ...x, edge: { ...x.edge, [which]: { ...x.edge[which], ...patch } } }));
  const setCabinet = (id: string, patch: Partial<CabinetSpec>) =>
    update((p) => ({ ...p, cabinets: p.cabinets.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // A new cabinet stands to the right of the row; labels keep counting up.
  const nextLabel = () => `M${Math.max(0, ...project.cabinets.map((c) => Number(c.label.replace(/\D/g, "")) || 0)) + 1}`;
  const addCabinet = (type: CabinetSpec['type']) =>
    update((p) => {
      const cab = newCabinet(nextLabel(), 0, type);
      setOpenId(cab.id);
      return { ...p, cabinets: [...p.cabinets, { ...cab, position: { x: nextX(p.cabinets, type, cab.width), z: 0 } }] };
    });
  const duplicate = (c: CabinetSpec) => {
    const id = crypto.randomUUID();
    setOpenId(id);
    update((p) => ({ ...p, cabinets: [...p.cabinets, { ...structuredClone(c), id, label: nextLabel(), position: { x: nextX(project.cabinets, c.type, c.width), z: 0 } }] }));
  };
  const confirm = useConfirm();
  // A removed cabinet is saved away at once, with all its settings: ask first.
  const remove = async (id: string, label: string) => {
    if (!(await confirm({ title: t("mebel.remove_confirm", { label }), destructive: true, confirmLabel: t("mebel.remove") }))) return;
    update((p) => ({ ...p, cabinets: p.cabinets.filter((c) => c.id !== id) }));
  };

  const errorFor = (cabId: string, key: keyof CabinetSpec) => {
    const e = errors.find((x) => x.cabinetId === cabId && ERROR_FIELD[x.code] === key);
    return e ? t(`mebel.error.${e.code}` as TKey, e.params) : undefined;
  };
  const bandThickness = [0, 0.4, 1, 2] as const;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="mebel-name" className="text-xs text-neutral-500">{t("mebel.project_name")}</label>
        <input id="mebel-name" value={project.name} maxLength={120} className={field}
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }))} />
      </div>

      {/* Set once per project, then folded away so the cabinets get the room. */}
      <details data-testid="section-settings" className="group rounded-2xl border border-neutral-200 p-3">
        <summary className={summary}>{t("mebel.settings")}<Chevron /></summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Select id="mebel-t" label={t("mebel.board_thickness")} value={d.board.thickness}
            options={[16, 18].map((v) => ({ value: v as 16 | 18, label: `${v} ${t("mebel.mm")}` }))}
            onChange={(v) => setDefaults((x) => ({ ...x, board: { ...x.board, thickness: v } }))} />
          <MaterialSelect id="mebel-board" label={t("mebel.board_material")} value={d.board.materialId} options={catalog.ldsp}
            onChange={(v) => setDefaults((x) => ({ ...x, board: { ...x.board, materialId: v } }))} />
          <Select id="mebel-back" label={t("mebel.back_kind")} value={d.back.kind}
            options={(["hdf_nailed", "hdf_groove", "none"] as const).map((v) => ({ value: v, label: t(`mebel.back.${v}`) }))}
            onChange={(v) => setDefaults((x) => ({ ...x, back: { ...x.back, kind: v } }))} />
          <MaterialSelect id="mebel-back-mat" label={t("mebel.back_material")} value={d.back.materialId ?? null} options={catalog.hdf}
            onChange={(v) => setDefaults((x) => ({ ...x, back: { ...x.back, materialId: v } }))} />
          <Select id="mebel-joint" label={t("mebel.bottom_joint")} value={d.bottomJoint}
            options={(["between_sides", "under_sides"] as const).map((v) => ({ value: v, label: t(`mebel.joint.${v}`) }))}
            onChange={(v) => setDefaults((x) => ({ ...x, bottomJoint: v }))} />
          <div />
          {(["visible", "hidden"] as const).map((which) => (
            <div key={which} className="contents">
              <Select id={`mebel-edge-${which}`} label={t(`mebel.edge_${which}`)} value={d.edge[which].thickness}
                options={bandThickness.map((v) => ({ value: v, label: v === 0 ? "—" : `${v} ${t("mebel.mm")}` }))}
                onChange={(v) => setBand(which, { thickness: v })} />
              <MaterialSelect id={`mebel-edge-${which}-mat`} label={t("mebel.edge_material")} value={d.edge[which].materialId}
                options={catalog.kromka} onChange={(v) => setBand(which, { materialId: v })} />
            </div>
          ))}
          <NumField id="mebel-sheet-l" label={`${t("mebel.sheet_size")}, L`} value={d.sheet.length}
            onChange={(v) => setDefaults((x) => ({ ...x, sheet: { ...x.sheet, length: v } }))} />
          <NumField id="mebel-sheet-w" label={`${t("mebel.sheet_size")}, W`} value={d.sheet.width}
            onChange={(v) => setDefaults((x) => ({ ...x, sheet: { ...x.sheet, width: v } }))} />
          <NumField id="mebel-kerf" label={t("mebel.kerf")} value={d.kerf ?? 4}
            onChange={(v) => setDefaults((x) => ({ ...x, kerf: v }))} />
          <NumField id="mebel-trim" label={t("mebel.trim")} value={d.trim ?? 10}
            onChange={(v) => setDefaults((x) => ({ ...x, trim: v }))} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={d.edge.premilled}
            onChange={(e) => setDefaults((x) => ({ ...x, edge: { ...x.edge, premilled: e.target.checked } }))} />
          {t("mebel.premilled")}
        </label>
      </details>

      <details data-testid="section-facade" className="group rounded-2xl border border-neutral-200 p-3">
        <summary className={summary}>{t("mebel.facade")}<Chevron /></summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Select id="mebel-facade-kind" label={t("mebel.facade_kind")} value={d.facade?.kind ?? "none"}
            options={(["ldsp", "mdf", "none"] as const).map((v) => ({ value: v, label: t(`mebel.facade_kinds.${v}`) }))}
            onChange={(v) => setDefaults((x) => ({ ...x, facade: { ...x.facade, kind: v, materialId: null } }))} />
          {d.facade?.kind !== "none" && (
            <MaterialSelect id="mebel-facade-mat" label={t("mebel.facade_material")} value={d.facade.materialId}
              options={d.facade.kind === "mdf" ? catalog.mdf : catalog.ldsp}
              onChange={(v) => setDefaults((x) => ({ ...x, facade: { ...x.facade, materialId: v } }))} />
          )}
          {d.facade?.kind !== "none" && (
            <Select id="mebel-facade-t" label={t("mebel.facade_thickness")} value={d.facade.thickness}
              options={([16, 18, 19] as const).map((v) => ({ value: v, label: `${v} ${t("mebel.mm")}` }))}
              onChange={(v) => setDefaults((x) => ({ ...x, facade: { ...x.facade, thickness: v } }))} />
          )}
          {d.facade?.kind !== "none" && (
            <NumField id="mebel-facade-gap" label={t("mebel.facade_gap")} value={d.facade.gap}
              onChange={(v) => setDefaults((x) => ({ ...x, facade: { ...x.facade, gap: v } }))} />
          )}
        </div>
      </details>

      <section className="flex flex-col gap-2">
        {/* stays in view while the list scrolls */}
        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between bg-white px-1 py-2">
          <h2 className="text-sm font-bold text-neutral-900">{t("mebel.cabinets")}</h2>
          <button type="button" onClick={() => update((p) => ({ ...p, cabinets: relayout(p.cabinets) }))}
            title={t("mebel.relayout_hint")}
            className="ml-auto mr-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900">
            {t("mebel.relayout")}
          </button>
          <div className="flex gap-1" role="group" aria-label={t("mebel.add_cabinet")}>
            {(["base", "wall", "tall"] as const).map((type) => (
              <button key={type} type="button" onClick={() => addCabinet(type)}
                className="rounded-full bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                {t(`mebel.add.${type}`)}
              </button>
            ))}
          </div>
        </div>
        {project.cabinets.map((c) => {
          const hasError = errors.some((e) => e.cabinetId === c.id);
          // a cabinet with an error stays open, so its red field is in view
          const open = openId === c.id || hasError;
          return (
          <details key={c.id} data-testid={`cabinet-${c.label}`} open={open}
            className={`group rounded-2xl border ${open ? "border-blue-200 bg-blue-50/30" : "border-neutral-200"}`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm"
              onClick={(e) => { e.preventDefault(); setOpenId(openId === c.id ? null : c.id); }}>
              {hasError && <span data-testid="cabinet-error-dot" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
              <span className="font-bold text-neutral-900">{c.label}</span>
              <span className="text-neutral-500">· {t(`mebel.type.${c.type ?? "base"}`)}</span>
              <span className="ml-auto truncate tabular-nums text-xs text-neutral-500">
                {`${c.width}×${c.height}×${c.depth} · ${t("mebel.position_short", { x: c.position.x })}`}
              </span>
              <Chevron />
            </summary>
            <div className="grid grid-cols-2 gap-3 px-3 pb-3">
              <NumField id={`${c.id}-w`} label={t("mebel.width")} value={c.width} error={errorFor(c.id, "width")}
                onChange={(v) => setCabinet(c.id, { width: v })} />
              <NumField id={`${c.id}-h`} label={t("mebel.height")} value={c.height} error={errorFor(c.id, "height")}
                onChange={(v) => setCabinet(c.id, { height: v })} />
              <NumField id={`${c.id}-d`} label={t("mebel.depth")} value={c.depth} error={errorFor(c.id, "depth")}
                onChange={(v) => setCabinet(c.id, { depth: v })} />
              <NumField id={`${c.id}-s`} label={t("mebel.shelves")} value={c.shelves} error={errorFor(c.id, "shelves")}
                disabled={(c.drawers ?? 0) > 0} onChange={(v) => setCabinet(c.id, { shelves: v })} />
              {(c.type ?? "base") === "base" && (
                <Select id={`${c.id}-drawers`} label={t("mebel.drawers")} value={String(c.drawers ?? 0)} error={errorFor(c.id, "drawers")}
                  options={["0", "1", "2", "3", "4"].map((v) => ({ value: v, label: v }))}
                  onChange={(v) => setCabinet(c.id, { drawers: Number(v) as 0 | 1 | 2 | 3 | 4 })} />
              )}
              <NumField id={`${c.id}-x`} label={t("mebel.position_x")} value={c.position.x} error={errorFor(c.id, "position")}
                onChange={(v) => setCabinet(c.id, { position: { ...c.position, x: v } })} />
              <Select id={`${c.id}-doors`} label={t("mebel.doors")} disabled={(c.drawers ?? 0) > 0}
                value={c.doors == null ? "auto" : String(c.doors)}
                options={["auto", "0", "1", "2"].map((v) => ({ value: v, label: v === "auto" ? t("mebel.doors_auto") : v }))}
                onChange={(v) => setCabinet(c.id, { doors: v === "auto" ? undefined : (Number(v) as 0 | 1 | 2) })} />
            </div>
            <div className="flex gap-2 px-3 pb-3">
              <button type="button" onClick={() => duplicate(c)} className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
                {t("mebel.duplicate")}
              </button>
              {project.cabinets.length > 1 && (
                <button type="button" onClick={() => void remove(c.id, c.label)} className="text-xs font-semibold text-red-600">
                  {t("mebel.remove")}
                </button>
              )}
            </div>
          </details>
          );
        })}
      </section>
    </div>
  );
}
