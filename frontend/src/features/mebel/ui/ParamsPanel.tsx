import { useTranslation } from "react-i18next";
import type { TKey } from "@/i18n";
import { newCabinet } from "@/features/mebel/engine";
import type { CabinetSpec, ConstructionDefaults, EdgeBandRef, FurnitureProject, Warning } from "@/features/mebel/engine";

export interface CatalogOption { id: string; name: string }
export interface CatalogOptions { ldsp: CatalogOption[]; hdf: CatalogOption[]; kromka: CatalogOption[] }

type Update = (fn: (p: FurnitureProject) => FurnitureProject) => void

/** The field each validation error belongs to, so that field is marked. */
export const ERROR_FIELD: Record<string, keyof CabinetSpec> = {
  width_range: "width", inner_width: "width", height_range: "height",
  depth_range: "depth", shelf_depth: "depth", shelves_range: "shelves",
};

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const invalidField = "border-red-400 bg-red-50";

function NumField({
  id, label, value, onChange, error,
}: { id: string; label: string; value: number; onChange(v: number): void; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-500">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        className={`${field} ${error ? invalidField : ""}`}
      />
      {error && <p id={`${id}-err`} className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Select<T extends string | number>({
  id, label, value, options, onChange,
}: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-neutral-500">{label}</label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
        className={field}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
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
  project, update, errors, catalog,
}: { project: FurnitureProject; update: Update; errors: Warning[]; catalog: CatalogOptions }) {
  const { t } = useTranslation();
  const d = project.defaults;
  const setDefaults = (patch: (d: ConstructionDefaults) => ConstructionDefaults) =>
    update((p) => ({ ...p, defaults: patch(p.defaults) }));
  const setBand = (which: "visible" | "hidden", patch: Partial<EdgeBandRef>) =>
    setDefaults((x) => ({ ...x, edge: { ...x.edge, [which]: { ...x.edge[which], ...patch } } }));
  const setCabinet = (id: string, patch: Partial<CabinetSpec>) =>
    update((p) => ({ ...p, cabinets: p.cabinets.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // A new cabinet stands to the right of the row; labels keep counting up.
  const nextLabel = () => `M${Math.max(0, ...project.cabinets.map((c) => Number(c.label.replace(/\D/g, "")) || 0)) + 1}`;
  const rowEnd = () => Math.max(0, ...project.cabinets.map((c) => c.position.x + (Number.isFinite(c.width) ? c.width : 0)));
  const addCabinet = () => update((p) => ({ ...p, cabinets: [...p.cabinets, newCabinet(nextLabel(), rowEnd())] }));
  const duplicate = (c: CabinetSpec) =>
    update((p) => ({ ...p, cabinets: [...p.cabinets, { ...structuredClone(c), id: crypto.randomUUID(), label: nextLabel(), position: { x: rowEnd(), z: 0 } }] }));
  const remove = (id: string) => update((p) => ({ ...p, cabinets: p.cabinets.filter((c) => c.id !== id) }));

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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-900">{t("mebel.settings")}</h2>
        <div className="grid grid-cols-2 gap-3">
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
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={d.edge.premilled}
            onChange={(e) => setDefaults((x) => ({ ...x, edge: { ...x.edge, premilled: e.target.checked } }))} />
          {t("mebel.premilled")}
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900">{t("mebel.cabinets")}</h2>
          <button type="button" onClick={addCabinet}
            className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
            {t("mebel.add_cabinet")}
          </button>
        </div>
        {project.cabinets.map((c) => (
          <fieldset key={c.id} className="rounded-2xl border border-neutral-200 p-3">
            <legend className="px-1 text-sm font-bold text-neutral-900">{c.label}</legend>
            <div className="grid grid-cols-2 gap-3">
              <NumField id={`${c.id}-w`} label={t("mebel.width")} value={c.width} error={errorFor(c.id, "width")}
                onChange={(v) => setCabinet(c.id, { width: v })} />
              <NumField id={`${c.id}-h`} label={t("mebel.height")} value={c.height} error={errorFor(c.id, "height")}
                onChange={(v) => setCabinet(c.id, { height: v })} />
              <NumField id={`${c.id}-d`} label={t("mebel.depth")} value={c.depth} error={errorFor(c.id, "depth")}
                onChange={(v) => setCabinet(c.id, { depth: v })} />
              <NumField id={`${c.id}-s`} label={t("mebel.shelves")} value={c.shelves} error={errorFor(c.id, "shelves")}
                onChange={(v) => setCabinet(c.id, { shelves: v })} />
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => duplicate(c)} className="text-xs font-semibold text-neutral-600 hover:text-neutral-900">
                {t("mebel.duplicate")}
              </button>
              {project.cabinets.length > 1 && (
                <button type="button" onClick={() => remove(c.id)} className="text-xs font-semibold text-red-600">
                  {t("mebel.remove")}
                </button>
              )}
            </div>
          </fieldset>
        ))}
      </section>
    </div>
  );
}
