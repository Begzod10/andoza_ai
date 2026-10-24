import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentLanguage } from "@/i18n";
import {
  MATERIAL_CATEGORIES, MATERIAL_UNITS, PACK_UNITS, SMETA_KEYS, listAdminMaterials, listAdminStores, updateAdminMaterial,
  type AdminMaterial,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { IconBubble, Panel } from "@/components/ui/Panel";
import { errorMessage } from "./errorMessage";
import { MaterialFormDialog } from "./MaterialFormDialog";
import { optionLabel, smetaLabel } from "./materialLabels";

const KEY = ["admin", "materials"] as const;
const SEARCH_DEBOUNCE_MS = 300;

// Plain-space groups as uz always showed (and ru, like formatUZS); en reads "245,000".
const price = (n: number) =>
  Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, currentLanguage() === "en" ? "," : " ");

function Row({ material: m, busy, onEdit, onToggle }: {
  material: AdminMaterial; busy: boolean; onEdit: (m: AdminMaterial) => void; onToggle: (m: AdminMaterial) => void;
}) {
  const { t } = useTranslation();
  const smeta = m.smeta_key ? smetaLabel(SMETA_KEYS, m.smeta_key, t) : null;
  return (
    <Panel className={`flex flex-wrap items-center justify-between gap-3 p-4 ${m.is_active ? "" : "opacity-70"}`}>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-extrabold text-ink">{m.name_uz}</p>
        <p className="text-xs text-ink-muted">
          {m.store_name ?? "—"} · <span>{optionLabel(MATERIAL_CATEGORIES, m.category, t)}</span>
        </p>
        <p className="text-xs text-ink">
          {`${t("common.price_som", { price: price(m.price_uzs) })} / ${optionLabel(MATERIAL_UNITS, m.unit, t)}`}
          {m.pack_qty != null && m.pack_unit && <span className="ml-2 text-ink-muted">{`${m.pack_qty} ${optionLabel(PACK_UNITS, m.pack_unit, t)}`}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {smeta && <span className="rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold text-ink">{t("dokon.admin.mat.smeta_badge", { key: smeta })}</span>}
          {!m.is_active && <span className="rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">{t("dokon.admin.mat.hidden")}</span>}
          {m.store_open === false && <span className="rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold text-ink-muted" title={t("dokon.admin.mat.shop_closed_hint")}>{t("dokon.admin.mat.shop_closed")}</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="soft" onClick={() => onEdit(m)}>{t("dokon.admin.tahrirlash")}</Button>
        <Button size="sm" variant="soft" loading={busy} onClick={() => onToggle(m)}>{m.is_active ? t("dokon.admin.mat.hide") : t("dokon.admin.mat.show")}</Button>
      </div>
    </Panel>
  );
}

/** Shop materials the room estimate prices from: filter, hide/show, and (Task 5) add or edit. */
export function AdminMaterials({ onError }: { onError: (message: string | null) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [storeId, setStoreId] = useState("");
  const [smetaOnly, setSmetaOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  // Dialog state: 'new' = add, a material = edit, null = closed.
  const [editing, setEditing] = useState<AdminMaterial | null | "new">(null);

  // Any filter change goes back to the first page, in the same render as the filter
  // (an effect would first fetch the new filter's old page).
  const filterBy = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPageNo(1); };
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPageNo(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const filters = {
    ...(category && { category }),
    ...(storeId && { store_id: storeId }),
    ...(smetaOnly && { smeta: true }),
    ...(q && { q }),
    page: pageNo,
  };
  const materials = useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => listAdminMaterials(filters),
    placeholderData: keepPreviousData,
  });
  const stores = useQuery({ queryKey: ["admin", "stores"], queryFn: listAdminStores });
  // A list that won't load is reported in the panel's error line, like the other sections,
  // and that report is withdrawn once the list loads again. A list that never failed leaves
  // the line alone: it is shared with the other admin sections.
  const reportedLoadError = useRef(false);
  useEffect(() => {
    if (materials.error) {
      onError(errorMessage(materials.error, t("dokon.admin.mat.load_failed")));
      reportedLoadError.current = true;
    } else if (materials.isSuccess && reportedLoadError.current) {
      onError(null);
      reportedLoadError.current = false;
    }
  }, [materials.error, materials.isSuccess, onError, t]);

  // The studio's paint, wallpaper and floor pickers list materials too (["materials", ...]).
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
  };
  const toggle = useMutation({
    mutationFn: (m: AdminMaterial) => updateAdminMaterial(m.id, { is_active: !m.is_active }),
    onSuccess: () => onError(null),
    onError: (err) => onError(errorMessage(err, t("dokon.admin.mat.toggle_failed"))),
    onSettled: () => refresh(),
  });

  const data = materials.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <section className="space-y-3" aria-label={t("dokon.admin.mat.aria")}>
      <Panel className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <IconBubble tone="orange" className="h-10 w-10 rounded-2xl"><Boxes size={18} aria-hidden="true" /></IconBubble>
          <h2 className="text-base font-extrabold text-ink">{data ? t("dokon.admin.mat.title_count", { count: data.total }) : t("dokon.admin.mat.title")}</h2>
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" /> {t("dokon.admin.mat.add")}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select themed label={t("dokon.admin.kategoriya")} value={category} onChange={(e) => filterBy(setCategory)(e.target.value)}>
            <option value="">{t("dokon.admin.hammasi")}</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
          </Select>
          <Select themed label={t("dokon.admin.dokon")} value={storeId} onChange={(e) => filterBy(setStoreId)(e.target.value)}>
            <option value="">{t("dokon.admin.hammasi")}</option>
            {(stores.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input themed label={t("dokon.admin.qidirish")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("dokon.admin.mat.nomi_boyicha")} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" checked={smetaOnly} onChange={(e) => filterBy(setSmetaOnly)(e.target.checked)} />
            {t("dokon.admin.mat.smeta_only")}
          </label>
        </div>
      </Panel>

      {materials.isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      ) : materials.isError ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">{t("dokon.admin.yuklab_bolmadi")}</Panel>
      ) : !data || data.items.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">{t("dokon.admin.mat.not_found")}</Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.items.map((m) => (
            <Row key={m.id} material={m} busy={toggle.isPending && toggle.variables?.id === m.id} onEdit={setEditing} onToggle={(x) => toggle.mutate(x)} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-ink-muted">
          <Button size="sm" variant="soft" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)}>{t("dokon.admin.oldingi")}</Button>
          <span>{pageNo} / {pages}</span>
          <Button size="sm" variant="soft" disabled={pageNo >= pages} onClick={() => setPageNo((p) => p + 1)}>{t("dokon.admin.keyingi")}</Button>
        </div>
      )}
      <MaterialFormDialog
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        material={editing === "new" ? null : editing}
        stores={stores.data ?? []}
        onSaved={() => { onError(null); refresh(); }}
      />
    </section>
  );
}
