import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Eye, EyeOff, Pencil, Plus, ScrollText, Search } from "lucide-react";
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
import { MaterialFormDialog } from "./MaterialFormDialog";
import { FilterChip } from "./FilterChip";
import { optionLabel, smetaLabel } from "./materialLabels";
import { requestError, type FormError } from "@/lib/formError";

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
  const badge = "whitespace-nowrap rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold";
  // One shape for every card: the details on top, the actions pinned to the bottom, so cards in a
  // row are the same height and their buttons line up whatever the name's length.
  return (
    <Panel className={`flex h-full min-w-0 flex-col gap-3 p-4 transition-colors hover:border-ink/20 ${m.is_active ? "" : "opacity-70"}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="line-clamp-2 break-words text-sm font-extrabold text-ink" title={m.name_uz}>{m.name_uz}</p>
        <p className="truncate text-xs text-ink-muted">
          {m.store_name ?? "—"} · <span>{optionLabel(MATERIAL_CATEGORIES, m.category, t)}</span>
        </p>
        <p className="text-xs text-ink">
          {`${t("common.price_som", { price: price(m.price_uzs) })} / ${optionLabel(MATERIAL_UNITS, m.unit, t)}`}
          {m.pack_qty != null && m.pack_unit && <span className="ml-2 text-ink-muted">{`${m.pack_qty} ${optionLabel(PACK_UNITS, m.pack_unit, t)}`}</span>}
        </p>
        {(smeta || !m.is_active || m.store_open === false) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {smeta && <span className={`${badge} text-ink`}>{t("dokon.admin.mat.smeta_badge", { key: smeta })}</span>}
            {!m.is_active && <span className={`${badge} text-ink-muted`}>{t("dokon.admin.mat.hidden")}</span>}
            {m.store_open === false && <span className={`${badge} text-ink-muted`} title={t("dokon.admin.mat.shop_closed_hint")}>{t("dokon.admin.mat.shop_closed")}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button size="sm" variant="soft" leftIcon={<Pencil size={14} aria-hidden="true" />} onClick={() => onEdit(m)}>
          {t("dokon.admin.tahrirlash")}
        </Button>
        <Button
          size="sm"
          variant="soft"
          loading={busy}
          leftIcon={m.is_active ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          onClick={() => onToggle(m)}
        >
          {m.is_active ? t("dokon.admin.mat.hide") : t("dokon.admin.mat.show")}
        </Button>
      </div>
    </Panel>
  );
}

/** Shop materials the room estimate prices from: filter, hide/show, and (Task 5) add or edit. */
export function AdminMaterials({ onError }: { onError: (message: FormError) => void }) {
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
      onError(requestError(materials.error, "dokon.admin.mat.load_failed"));
      reportedLoadError.current = true;
    } else if (materials.isSuccess && reportedLoadError.current) {
      onError(null);
      reportedLoadError.current = false;
    }
  }, [materials.error, materials.isSuccess, onError]);

  // The studio's paint, wallpaper and floor pickers list materials too (["materials", ...]).
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
  };
  const toggle = useMutation({
    mutationFn: (m: AdminMaterial) => updateAdminMaterial(m.id, { is_active: !m.is_active }),
    onSuccess: () => onError(null),
    onError: (err) => onError(requestError(err, "dokon.admin.mat.toggle_failed")),
    onSettled: () => refresh(),
  });

  const data = materials.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <section className="space-y-3" aria-label={t("dokon.admin.mat.aria")}>
      <Panel className="space-y-4 px-4 py-3">
        {/* One row at every width: on a phone the icon steps aside so title and button still fit. */}
        <div className="flex items-center gap-3">
          <IconBubble tone="orange" className="hidden h-10 w-10 rounded-2xl sm:flex"><Boxes size={18} aria-hidden="true" /></IconBubble>
          <h2 className="min-w-0 flex-1 truncate text-base font-extrabold text-ink">{data ? t("dokon.admin.mat.title_count", { count: data.total }) : t("dokon.admin.mat.title")}</h2>
          {/* The icon goes through leftIcon: inside the label span it is a block svg (preflight)
              and sat on a line of its own above the text. */}
          <Button size="sm" className="shrink-0 whitespace-nowrap" leftIcon={<Plus size={14} aria-hidden="true" />} onClick={() => setEditing("new")}>
            {t("dokon.admin.mat.add")}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select themed label={t("dokon.admin.kategoriya")} value={category} onChange={(e) => filterBy(setCategory)(e.target.value)}>
            <option value="">{t("dokon.admin.hammasi")}</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
          </Select>
          <Select themed label={t("dokon.admin.dokon")} value={storeId} onChange={(e) => filterBy(setStoreId)(e.target.value)}>
            <option value="">{t("dokon.admin.hammasi")}</option>
            {(stores.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              themed
              type="search"
              label={t("dokon.admin.qidirish")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("dokon.admin.mat.nomi_boyicha")}
              startIcon={<Search size={16} aria-hidden="true" />}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip pressed={smetaOnly} onClick={() => filterBy(setSmetaOnly)(!smetaOnly)} icon={<ScrollText size={14} />}>
            {t("dokon.admin.mat.smeta_only")}
          </FilterChip>
        </div>
      </Panel>

      {materials.isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      ) : materials.isError ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">{t("dokon.admin.yuklab_bolmadi")}</Panel>
      ) : !data || data.items.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">{t("dokon.admin.mat.not_found")}</Panel>
      ) : (
        // Dimmed while a new filter's page loads: the old page stays up (keepPreviousData), and
        // without this a filter change looked like it did nothing.
        <div
          className={`grid grid-cols-1 gap-3 transition-opacity lg:grid-cols-2 ${materials.isFetching && materials.isPlaceholderData ? "opacity-60" : ""}`}
          aria-busy={materials.isFetching && materials.isPlaceholderData}
        >
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
