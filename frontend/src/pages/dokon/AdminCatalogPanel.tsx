import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_FURNITURE_CATEGORIES,
  ADMIN_PARTNER_TIERS,
  ADMIN_ROOM_TYPES,
  createAdminStore,
  deleteAdminFurniture,
  deleteAdminStore,
  listAdminFurniture,
  listAdminStores,
  uploadAdminFurniture,
  type AdminFurniture,
  type AdminFurnitureCategory,
  type AdminPartnerTier,
  type AdminRoomType,
  type AdminStore,
} from "@/lib/api";

const CATEGORY_LABELS: Record<AdminFurnitureCategory, string> = {
  divan: "Divan",
  stol: "Stol",
  stul: "Stul",
  karavot: "Karavot",
  shkaf: "Shkaf",
  lampa: "Lampa",
  boshqa: "Boshqa",
};

const ROOM_TYPE_LABELS: Record<AdminRoomType, string> = {
  mehmonxona: "Mehmonxona",
  oshxona: "Oshxona",
  yotoqxona: "Yotoqxona",
  hammom: "Hammom",
  balkon: "Balkon",
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Admin-only surface on the Do'kon page: create shops, and upload the 3D
 * models each shop sells — tagged with what kind of furniture it is and
 * which room it belongs in, the two facts the shop catalog filters on.
 */
export default function AdminCatalogPanel() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: stores = [] } = useQuery<AdminStore[]>({
    queryKey: ["admin", "stores"],
    queryFn: listAdminStores,
  });
  const { data: models = [] } = useQuery<AdminFurniture[]>({
    queryKey: ["admin", "furniture"],
    queryFn: () => listAdminFurniture(),
  });

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-8">
      <h1 className="text-lg font-semibold text-neutral-800">Do'kon boshqaruvi</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <StoreSection
        stores={stores}
        onError={setError}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["admin", "stores"] })}
      />

      <ModelSection
        stores={stores}
        models={models}
        onError={setError}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------------

function StoreSection({
  stores,
  onError,
  onChanged,
}: {
  stores: AdminStore[];
  onError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [tier, setTier] = useState<AdminPartnerTier>("standard");

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminStore({ name, district: district || null, partner_tier: tier }),
    onSuccess: () => {
      setName("");
      setDistrict("");
      setTier("standard");
      onError(null);
      onChanged();
    },
    onError: (err) => onError(errorMessage(err, "Do'konni yaratib bo'lmadi")),
  });

  async function handleDelete(store: AdminStore) {
    if (!window.confirm(`"${store.name}" do'koni va uning barcha modellari o'chirilsinmi?`)) return;
    try {
      await deleteAdminStore(store.id);
      onError(null);
      onChanged();
    } catch (err) {
      onError(errorMessage(err, "O'chirib bo'lmadi"));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-700">Do'konlar</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] text-neutral-500 mb-1">Nomi</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Do'kon nomi"
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] text-neutral-500 mb-1">Tuman</label>
          <input
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="Masalan: Chilonzor"
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 mb-1">Daraja</label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as AdminPartnerTier)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {ADMIN_PARTNER_TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!name.trim() || createMutation.isPending}
          className="rounded-lg bg-brand text-white text-sm font-semibold px-4 py-1.5 disabled:opacity-40"
        >
          {createMutation.isPending ? "Yaratilmoqda…" : "Qo'shish"}
        </button>
      </form>

      <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
        {stores.length === 0 && (
          <li className="px-3 py-3 text-sm text-neutral-400">Hali do'kon yo'q</li>
        )}
        {stores.map((store) => (
          <li key={store.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-neutral-800">{store.name}</span>
              {store.district && <span className="text-neutral-400"> · {store.district}</span>}
              <span className="ml-2 text-[10px] uppercase tracking-wide text-brand">{store.partner_tier}</span>
              {!store.is_active && <span className="ml-2 text-[10px] text-red-500">nofaol</span>}
            </div>
            <button
              onClick={() => handleDelete(store)}
              title="O'chirish"
              className="text-neutral-400 hover:text-red-500 text-xs"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3D models
// ---------------------------------------------------------------------------

function ModelSection({
  stores,
  models,
  onError,
  onChanged,
}: {
  stores: AdminStore[];
  models: AdminFurniture[];
  onError: (msg: string | null) => void;
  onChanged: () => void;
}) {
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("divan");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [storeId, setStoreId] = useState<string>("");
  const [priceUzs, setPriceUzs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("GLB fayl tanlanmagan");
      return uploadAdminFurniture({
        file,
        thumbnail,
        name_uz: nameUz,
        category,
        room_type: roomType || null,
        store_id: storeId || null,
        price_uzs: priceUzs ? Number(priceUzs) : null,
      });
    },
    onSuccess: () => {
      setNameUz("");
      setCategory("divan");
      setRoomType("");
      setStoreId("");
      setPriceUzs("");
      setFile(null);
      setThumbnail(null);
      onError(null);
      onChanged();
    },
    onError: (err) => onError(errorMessage(err, "Modelni yuklab bo'lmadi")),
  });

  async function handleDelete(model: AdminFurniture) {
    if (!window.confirm(`"${model.name_uz}" o'chirilsinmi?`)) return;
    try {
      await deleteAdminFurniture(model.id);
      onError(null);
      onChanged();
    } catch (err) {
      onError(errorMessage(err, "O'chirib bo'lmadi"));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-700">3D Modellar</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameUz.trim() || !file) return;
          uploadMutation.mutate();
        }}
        className="space-y-2 rounded-xl border border-neutral-100 p-3"
      >
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-neutral-500 mb-1">Nomi</label>
            <input
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder="Masalan: Uch o'rinli divan"
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1">Turi</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}
              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {ADMIN_FURNITURE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1">Xona</label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}
              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Barcha xonalar</option>
              {ADMIN_ROOM_TYPES.map((r) => (
                <option key={r} value={r}>{ROOM_TYPE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-neutral-500 mb-1">Do'kon</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">— tanlanmagan —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1">Narxi (so'm)</label>
            <input
              type="number"
              min={0}
              value={priceUzs}
              onChange={(e) => setPriceUzs(e.target.value)}
              placeholder="4500000"
              className="w-32 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1">3D model (.glb)</label>
            <input
              type="file"
              accept=".glb"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] text-neutral-500 mb-1">Rasm (ixtiyoriy)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!nameUz.trim() || !file || uploadMutation.isPending}
          className="rounded-lg bg-brand text-white text-sm font-semibold px-4 py-1.5 disabled:opacity-40"
        >
          {uploadMutation.isPending ? "Yuklanmoqda…" : "Modelni yuklash"}
        </button>
      </form>

      <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-xl">
        {models.length === 0 && (
          <li className="px-3 py-3 text-sm text-neutral-400">Hali model yo'q</li>
        )}
        {models.map((model) => (
          <li key={model.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            {model.thumbnail_url ? (
              <img
                src={model.thumbnail_url}
                alt={model.name_uz}
                className="w-10 h-10 rounded-lg object-cover border border-neutral-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-300 text-xs">
                3D
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-neutral-800 truncate">{model.name_uz}</div>
              <div className="text-[11px] text-neutral-400">
                {CATEGORY_LABELS[model.category as AdminFurnitureCategory] ?? model.category}
                {" · "}
                {model.room_type ? ROOM_TYPE_LABELS[model.room_type as AdminRoomType] ?? model.room_type : "Barcha xonalar"}
                {model.store_name ? ` · ${model.store_name}` : ""}
              </div>
            </div>
            {model.price_uzs != null && (
              <span className="text-neutral-500 whitespace-nowrap">
                {model.price_uzs.toLocaleString("uz-UZ")} so'm
              </span>
            )}
            <button
              onClick={() => handleDelete(model)}
              title="O'chirish"
              className="text-neutral-400 hover:text-red-500 text-xs"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
