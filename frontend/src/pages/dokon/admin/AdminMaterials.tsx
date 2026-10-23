import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus } from "lucide-react";
import {
  MATERIAL_CATEGORIES, MATERIAL_UNITS, SMETA_KEYS, listAdminMaterials, listAdminStores, updateAdminMaterial,
  type AdminMaterial,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { IconBubble, Panel } from "@/components/ui/Panel";
import { errorMessage } from "./errorMessage";
import { MaterialFormDialog } from "./MaterialFormDialog";

const KEY = ["admin", "materials"] as const;
const SEARCH_DEBOUNCE_MS = 300;

const label = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
const price = (n: number) => Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function Row({ material: m, busy, onEdit, onToggle }: {
  material: AdminMaterial; busy: boolean; onEdit: (m: AdminMaterial) => void; onToggle: (m: AdminMaterial) => void;
}) {
  const smeta = m.smeta_key ? label(SMETA_KEYS, m.smeta_key) : null;
  return (
    <Panel className={`flex flex-wrap items-center justify-between gap-3 p-4 ${m.is_active ? "" : "opacity-70"}`}>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-extrabold text-ink">{m.name_uz}</p>
        <p className="text-xs text-ink-muted">
          {m.store_name ?? "—"} · <span>{label(MATERIAL_CATEGORIES, m.category)}</span>
        </p>
        <p className="text-xs text-ink">
          {`${price(m.price_uzs)} so'm / ${label(MATERIAL_UNITS, m.unit)}`}
          {m.pack_qty != null && m.pack_unit && <span className="ml-2 text-ink-muted">{`${m.pack_qty} ${m.pack_unit}`}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {smeta && <span className="rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold text-ink">{`Smeta: ${smeta}`}</span>}
          {!m.is_active && <span className="rounded-full border border-line bg-card-soft px-2.5 py-0.5 text-[11px] font-bold text-ink-muted">Yashirin</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="soft" onClick={() => onEdit(m)}>Tahrirlash</Button>
        <Button size="sm" variant="soft" loading={busy} onClick={() => onToggle(m)}>{m.is_active ? "Yashirish" : "Ko'rsatish"}</Button>
      </div>
    </Panel>
  );
}

/** Shop materials the room estimate prices from: filter, hide/show, and (Task 5) add or edit. */
export function AdminMaterials({ onError }: { onError: (message: string | null) => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [storeId, setStoreId] = useState("");
  const [smetaOnly, setSmetaOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(1);
  // Dialog state: 'new' = add, a material = edit, null = closed.
  const [editing, setEditing] = useState<AdminMaterial | null | "new">(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);
  // Any filter change goes back to the first page.
  useEffect(() => setPageNo(1), [category, storeId, smetaOnly, q]);

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

  const toggle = useMutation({
    mutationFn: (m: AdminMaterial) => updateAdminMaterial(m.id, { is_active: !m.is_active }),
    onSuccess: () => onError(null),
    onError: (err) => onError(errorMessage(err, "Materialni o'zgartirib bo'lmadi")),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const data = materials.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <section className="space-y-3" aria-label="Materiallar">
      <Panel className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <IconBubble tone="orange" className="h-10 w-10 rounded-2xl"><Boxes size={18} aria-hidden="true" /></IconBubble>
          <h2 className="text-base font-extrabold text-ink">Materiallar{data ? ` (${data.total})` : ""}</h2>
          <Button size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" /> Material qo'shish
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select themed label="Kategoriya" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Hammasi</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <Select themed label="Do'kon" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Hammasi</option>
            {(stores.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input themed label="Qidirish" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nomi bo'yicha" />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" checked={smetaOnly} onChange={(e) => setSmetaOnly(e.target.checked)} />
            Faqat smeta mahsulotlari
          </label>
        </div>
      </Panel>

      {materials.isLoading ? (
        <div className="h-24 animate-pulse rounded-3xl bg-card" />
      ) : materials.isError ? (
        <p className="text-sm text-red-500">{errorMessage(materials.error, "Materiallarni yuklab bo'lmadi")}</p>
      ) : !data || data.items.length === 0 ? (
        <Panel className="px-4 py-6 text-center text-sm text-ink-muted">Material topilmadi.</Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.items.map((m) => (
            <Row key={m.id} material={m} busy={toggle.isPending && toggle.variables?.id === m.id} onEdit={setEditing} onToggle={(x) => toggle.mutate(x)} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-ink-muted">
          <Button size="sm" variant="soft" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)}>Oldingi</Button>
          <span>{pageNo} / {pages}</span>
          <Button size="sm" variant="soft" disabled={pageNo >= pages} onClick={() => setPageNo((p) => p + 1)}>Keyingi</Button>
        </div>
      )}
      <MaterialFormDialog
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        material={editing === "new" ? null : editing}
        stores={stores.data ?? []}
        onSaved={() => { onError(null); void queryClient.invalidateQueries({ queryKey: KEY }); }}
      />
    </section>
  );
}
