import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRoomStore } from "@/store/roomStore";
import { getMaterials, type Material } from "@/lib/api/materials";
import { intlLocale } from "@/i18n";

/** The estimate lines the studio lets the user price with a shop product of their own
 *  choosing: the pick is kept in surfaces["smeta:<key>"], which the smeta engine reads
 *  (app.services.smeta.PICKED_PRODUCT_PREFIX) in place of the shop's cheapest product. */
export type PickableSmetaKey = "gipsokarton" | "profil" | "led_lenta" | "galtel";

export const pickedSurfaceKey = (key: PickableSmetaKey) => `smeta:${key}`;

/**
 * The shop products for one estimate line, as a pick list. Nothing at all when no shop
 * sells one: an empty heading would only promise a choice that is not there. Picking the
 * active product again clears the pick, and the line goes back to the cheapest product.
 */
export function ShopPickList({ smetaKey, title }: { smetaKey: PickableSmetaKey; title: string }) {
  const { t } = useTranslation();
  const surfaceKey = pickedSurfaceKey(smetaKey);
  const picked = useRoomStore((s) => s.surfaces[surfaceKey]);
  const applySurface = useRoomStore((s) => s.applySurface);

  const { data: products = [] } = useQuery({
    queryKey: ["materials", "smeta_key", smetaKey],
    queryFn: () => getMaterials({ smeta_key: smetaKey, per_page: 20 }),
    staleTime: 10 * 60 * 1000,
  });

  if (products.length === 0) return null;

  return (
    <div>
      <span className="text-xs text-gray-600 font-medium block mb-1.5">{title}</span>
      <div className="flex flex-col gap-2" role="listbox" aria-label={title}>
        {products.map((product: Material) => {
          const isActive = picked === product.id;
          return (
            <button
              key={product.id}
              onClick={() => applySurface(surfaceKey, isActive ? "" : product.id)}
              role="option"
              aria-selected={isActive}
              className={`w-full flex items-center gap-3 p-2.5 rounded-card text-left border-2 transition-colors ${
                isActive ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{product.name_uz}</p>
                <p className="text-xs text-muted">
                  {t("common.price_per_unit", { price: product.price_uzs.toLocaleString(intlLocale()), unit: product.unit })}
                  {product.store_name ? ` · ${product.store_name}` : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
