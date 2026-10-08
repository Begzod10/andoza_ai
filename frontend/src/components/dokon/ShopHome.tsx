import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Armchair, ReceiptText, Search, ShoppingCart } from "lucide-react";
import { getMaterials, listCatalogFurniture } from "@/lib/api";
import type { CatalogFurniture, Material } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

type Tab = "mebel" | "material";

const TAB_LABEL: Record<Tab, string> = { mebel: "Mebel", material: "Materiallar" };

/** Category names as a person reads them; anything unlisted shows as it is stored. */
const CATEGORY_LABEL: Record<string, string> = {
  divan: "Divan", stol: "Stol", stul: "Stul", shkaf: "Shkaf", karavot: "Karavot", boshqa: "Boshqa",
  boyoq: "Bo'yoq", oboy: "Oboy", laminat: "Laminat", parket: "Parket", plitka: "Plitka", gips: "Gips va suvoq",
  sement: "Sement", elektr_mat: "Elektr", santexnika: "Santexnika", eshik: "Eshik", deraza: "Deraza", dekorativ: "Dekorativ",
};
const label = (c: string) => CATEGORY_LABEL[c] ?? c;

/** A card's picture, with its price on a tab that notches into the corner (the tab takes the page's own colour). */
function Tile({
  image, fallback, title, meta, price, onOpen,
}: { image: string | null; fallback: React.ReactNode; title: string; meta: string; price: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left" aria-label={`${title}, ${price}`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-card-soft shadow-panel transition-transform duration-200 group-hover:-translate-y-0.5">
        {image ? (
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">{fallback}</div>
        )}
        <span className="absolute bottom-0 right-0 rounded-tl-3xl bg-[var(--color-app-bg)] px-4 pb-0 pt-2.5">
          <span className="inline-block rounded-full bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] px-4 py-1.5 text-sm font-bold text-white shadow-glow">
            {price}
          </span>
        </span>
      </div>
      <p className="mt-2.5 truncate px-1 text-[15px] font-bold text-on-app">{title}</p>
      <p className="truncate px-1 text-xs text-on-app-muted">{meta}</p>
    </button>
  );
}

export function ShopHome({
  cartCount, onCart, onProductSelect, onOrders,
}: { cartCount: number; onCart: () => void; onProductSelect: (product: any) => void; onOrders?: () => void }) {
  const [tab, setTab] = useState<Tab>("mebel");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const furniture = useQuery({ queryKey: ["shop", "furniture"], queryFn: () => listCatalogFurniture({ per_page: 100 }) });
  const materials = useQuery({
    queryKey: ["shop", "materials", query],
    queryFn: () => getMaterials({ per_page: 100, q: query.trim() || undefined }),
    enabled: tab === "material",
  });

  const needle = query.trim().toLowerCase();
  const furnitureItems = useMemo(
    () => (furniture.data?.items ?? []).filter((f) =>
      (!category || f.category === category) && (!needle || f.name_uz.toLowerCase().includes(needle))),
    [furniture.data, category, needle],
  );
  const materialItems = useMemo(
    () => (materials.data ?? []).filter((m) => !category || m.category === category),
    [materials.data, category],
  );

  const categories = useMemo(() => {
    const names = tab === "mebel"
      ? (furniture.data?.items ?? []).map((f) => f.category)
      : (materials.data ?? []).map((m) => m.category);
    return [...new Set(names)].sort();
  }, [tab, furniture.data, materials.data]);

  const active = tab === "mebel" ? furniture : materials;
  const items: Array<CatalogFurniture | Material> = tab === "mebel" ? furnitureItems : materialItems;
  const [featured, ...rest] = tab === "mebel" ? furnitureItems : [];

  function switchTab(next: Tab) {
    setTab(next);
    setCategory(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-28 pt-10 lg:px-6 lg:pb-8 lg:pt-6">
      {/* The title, the search, and what is in the basket. */}
      <Panel className="mb-5 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">Do'kon</h1>
          <p className="mt-1 text-sm text-ink-muted">Mebel va materiallar: narxlar do'konlar bo'yicha.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Qidirish…"
              aria-label="Qidirish"
              className="h-11 w-full rounded-full bg-card-soft pl-10 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-light"
            />
          </label>
          {onOrders && (
            <Button variant="soft" onClick={onOrders} leftIcon={<ReceiptText size={16} aria-hidden="true" />}>
              Buyurtmalarim
            </Button>
          )}
          <Button variant="accent" onClick={onCart} leftIcon={<ShoppingCart size={16} aria-hidden="true" />}>
            Savat{cartCount > 0 ? ` (${cartCount})` : ""}
          </Button>
        </div>
      </Panel>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Bo'lim" className="inline-flex gap-1 rounded-full bg-card p-1 shadow-panel">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                tab === t ? "bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow" : "text-ink-muted hover:text-ink"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Toifalar">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? null : c)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                category === c ? "bg-ink text-card" : "bg-card text-ink-muted shadow-panel hover:text-ink"
              }`}
            >
              {label(c)}
            </button>
          ))}
        </div>
      </div>

      {active.isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-card" />)}
        </div>
      )}
      {active.isError && (
        <p role="alert" className="py-12 text-center text-red-400">Katalog yuklanmadi. Birozdan keyin qayta urinib ko'ring.</p>
      )}
      {!active.isLoading && !active.isError && items.length === 0 && (
        <p className="py-12 text-center text-on-app-muted">Hech narsa topilmadi.</p>
      )}

      {tab === "mebel" && featured && (
        <div className="grid gap-4 lg:grid-cols-4">
          {/* The first match, large: the one to look at first. */}
          <Panel className="relative overflow-hidden lg:col-span-2 lg:row-span-2">
            <button type="button" onClick={() => onProductSelect(featured)} className="group block h-full w-full text-left" aria-label={`${featured.name_uz}, ${formatUZS(featured.price_uzs ?? 0)}`}>
              <div className={`relative aspect-[4/3] w-full overflow-hidden lg:aspect-auto lg:h-full lg:min-h-[320px] ${featured.thumbnail_url ? "bg-card-soft" : "bg-gradient-to-br from-[#3B4A8C] to-[#1F2A5E]"}`}>
                {featured.thumbnail_url && (
                  <img src={featured.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-5 bottom-5 flex flex-col items-start gap-3 text-white sm:inset-x-6 sm:bottom-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label(featured.category)}{featured.store_name ? ` · ${featured.store_name}` : ""}</p>
                    <p className="line-clamp-2 text-2xl font-extrabold leading-tight">{featured.name_uz}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#2F55D4]">
                    {featured.price_uzs ? formatUZS(featured.price_uzs) : "Narx so'rang"}
                  </span>
                </div>
              </div>
            </button>
          </Panel>
          {rest.map((f) => (
            <Tile
              key={f.id}
              image={f.thumbnail_url}
              fallback={<Armchair size={32} className="text-ink-muted" aria-hidden="true" />}
              title={f.name_uz}
              meta={`${label(f.category)}${f.store_name ? ` · ${f.store_name}` : ""}`}
              price={f.price_uzs ? formatUZS(f.price_uzs) : "Narx so'rang"}
              onOpen={() => onProductSelect(f)}
            />
          ))}
        </div>
      )}

      {tab === "material" && materialItems.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {materialItems.map((m) => (
            <Tile
              key={m.id}
              image={null}
              fallback={
                <span className="h-16 w-16 rounded-2xl shadow-inner" style={{ backgroundColor: m.color_hex ?? "#C9CFDD" }} aria-hidden="true" />
              }
              title={m.name_uz}
              meta={`${label(m.category)} · ${m.unit}`}
              price={formatUZS(m.price_uzs)}
              onOpen={() => onProductSelect(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
