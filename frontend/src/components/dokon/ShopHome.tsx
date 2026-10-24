import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { TKey } from "@/i18n";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Armchair, ReceiptText, Search, ShoppingCart } from "lucide-react";
import { getMaterials, listCatalogFurniture } from "@/lib/api";
import type { CatalogFurniture, Material } from "@/lib/api";
import { formatUZS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

type Tab = "mebel" | "material";

/** Where the shopper is in the catalog. Kept by the page, not by ShopHome, so
 *  opening a product and coming back (after "Add to cart") lands on the
 *  same tab, category and search instead of a fresh Mebel tab. */
export interface ShopBrowse {
  tab: Tab;
  category: string | null;
  query: string;
}
export const SHOP_BROWSE_START: ShopBrowse = { tab: "mebel", category: null, query: "" };

const TAB_KEYS: Record<Tab, TKey> = { mebel: "dokon.shop.tab_mebel", material: "dokon.shop.tab_material" };

/** Category names as a person reads them; anything unlisted shows as it is stored. */
const CATEGORY_KEYS: Record<string, TKey> = {
  divan: "dokon.shop.category.divan", stol: "dokon.shop.category.stol", stul: "dokon.shop.category.stul",
  shkaf: "dokon.shop.category.shkaf", karavot: "dokon.shop.category.karavot", lampa: "dokon.shop.category.lampa",
  boshqa: "dokon.shop.category.boshqa",
  boyoq: "dokon.shop.category.boyoq", oboy: "dokon.shop.category.oboy", laminat: "dokon.shop.category.laminat",
  parket: "dokon.shop.category.parket", plitka: "dokon.shop.category.plitka", gips: "dokon.shop.category.gips",
  sement: "dokon.shop.category.sement", elektr_mat: "dokon.shop.category.elektr_mat",
  santexnika: "dokon.shop.category.santexnika", eshik: "dokon.shop.category.eshik",
  deraza: "dokon.shop.category.deraza", dekorativ: "dokon.shop.category.dekorativ",
};
/** Every furniture category (app/schemas/admin_catalog.py FURNITURE_CATEGORIES), in chip order. */
const FURNITURE_CATEGORIES = ["divan", "stol", "stul", "karavot", "shkaf", "lampa", "boshqa"];
/** Furniture comes in pages of this many. */
const FURNITURE_PAGE = 60;

/** A catalog category key ("boyoq", "divan") as people read it. */
export const categoryLabel = (c: string, t: TFunction) => (c in CATEGORY_KEYS ? t(CATEGORY_KEYS[c]) : c);

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
  cartCount, onCart, onProductSelect, onOrders, browse, onBrowseChange,
}: {
  cartCount: number;
  onCart: () => void;
  onProductSelect: (product: any) => void;
  onOrders?: () => void;
  browse?: ShopBrowse;
  onBrowseChange?: (browse: ShopBrowse) => void;
}) {
  const { t } = useTranslation();
  const [own, setOwn] = useState<ShopBrowse>(SHOP_BROWSE_START);
  const { tab, category, query } = browse ?? own;
  const update = (patch: Partial<ShopBrowse>) => {
    const next = { ...(browse ?? own), ...patch };
    if (onBrowseChange) onBrowseChange(next);
    else setOwn(next);
  };
  const setCategory = (c: string | null) => update({ category: c });
  const setQuery = (q: string) => update({ query: q });

  // Category and search are asked of the server and the list comes in pages, so every
  // product can be reached however many shops there are (the server orders it stably).
  const furnitureQuery = query.trim() || undefined;
  const furniturePages = useInfiniteQuery({
    queryKey: ["shop", "furniture", category, furnitureQuery],
    queryFn: ({ pageParam }) => listCatalogFurniture({
      page: pageParam, per_page: FURNITURE_PAGE, category: category ?? undefined, q: furnitureQuery,
    }),
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      (all.reduce((n, p) => n + p.items.length, 0) < last.total && last.items.length > 0 ? all.length + 1 : undefined),
    enabled: tab === "mebel",
    placeholderData: keepPreviousData,
  });
  const furniture = {
    ...furniturePages,
    data: furniturePages.data ? { items: furniturePages.data.pages.flatMap((p) => p.items) } : undefined,
  };
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
    // Furniture: every category the catalog knows (the loaded page may hold only some).
    if (tab === "mebel") return FURNITURE_CATEGORIES;
    return [...new Set((materials.data ?? []).map((m) => m.category))].sort();
  }, [tab, materials.data]);

  const active = tab === "mebel" ? furniture : materials;
  const items: Array<CatalogFurniture | Material> = tab === "mebel" ? furnitureItems : materialItems;
  const [featured, ...rest] = tab === "mebel" ? furnitureItems : [];

  function switchTab(next: Tab) {
    update({ tab: next, category: null });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-28 pt-10 lg:px-6 lg:pb-8 lg:pt-6">
      {/* The title, the search, and what is in the basket. */}
      <Panel className="mb-5 flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-ink">{t("dokon.admin.dokon")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("dokon.shop.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dokon.shop.search_ph")}
              aria-label={t("dokon.admin.qidirish")}
              className="h-11 w-full rounded-full bg-card-soft pl-10 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-light"
            />
          </label>
          {onOrders && (
            <Button variant="soft" onClick={onOrders} leftIcon={<ReceiptText size={16} aria-hidden="true" />}>
              {t("dokon.screens.my_orders")}
            </Button>
          )}
          <Button variant="accent" onClick={onCart} leftIcon={<ShoppingCart size={16} aria-hidden="true" />}>
            {cartCount > 0 ? t("dokon.shop.cart_count", { n: cartCount }) : t("dokon.screens.cart_title")}
          </Button>
        </div>
      </Panel>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={t("dokon.shop.section")} className="inline-flex gap-1 rounded-full bg-card p-1 shadow-panel">
          {(Object.keys(TAB_KEYS) as Tab[]).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                tab === id ? "bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow" : "text-ink-muted hover:text-ink"
              }`}
            >
              {t(TAB_KEYS[id])}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label={t("dokon.shop.categories")}>
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
              {categoryLabel(c, t)}
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
        <p role="alert" className="py-12 text-center text-red-400">{t("dokon.shop.catalog_failed")}</p>
      )}
      {!active.isLoading && !active.isError && items.length === 0 && (
        <p className="py-12 text-center text-on-app-muted">{t("dokon.shop.nothing")}</p>
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{categoryLabel(featured.category, t)}{featured.store_name ? ` · ${featured.store_name}` : ""}</p>
                    <p className="line-clamp-2 text-2xl font-extrabold leading-tight">{featured.name_uz}</p>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#2F55D4]">
                    {featured.price_uzs ? formatUZS(featured.price_uzs) : t("dokon.screens.ask_price")}
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
              meta={`${categoryLabel(f.category, t)}${f.store_name ? ` · ${f.store_name}` : ""}`}
              price={f.price_uzs ? formatUZS(f.price_uzs) : t("dokon.screens.ask_price")}
              onOpen={() => onProductSelect(f)}
            />
          ))}
        </div>
      )}

      {tab === "mebel" && furniturePages.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button variant="soft" onClick={() => void furniturePages.fetchNextPage()} disabled={furniturePages.isFetchingNextPage}>
            {t("dokon.shop.more")}
          </Button>
        </div>
      )}

      {tab === "material" && materialItems.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {materialItems.map((m) => (
            <Tile
              key={m.id}
              image={m.image_url ?? null}
              fallback={
                <span className="h-16 w-16 rounded-2xl shadow-inner" style={{ backgroundColor: m.color_hex ?? "#C9CFDD" }} aria-hidden="true" />
              }
              title={m.name_uz}
              meta={`${categoryLabel(m.category, t)} · ${m.unit}`}
              price={formatUZS(m.price_uzs)}
              onOpen={() => onProductSelect(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
