import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { deleteWallpaper, listWallpapers, type AdminStore, type Wallpaper } from "@/lib/api";
import { intlLocale } from "@/i18n";
import type { TFunction } from "i18next";
import { errorMessage } from "./errorMessage";
import { WallpaperEditDialog } from "./WallpaperEditDialog";
import { WallpaperFormDialog } from "./WallpaperFormDialog";

/** "53 sm × 10 m" for a roll, "300 × 270 sm" for a fixed panel, or just the
 * width alone when that's all that's set. Empty when nothing is set. */
function dimensionsLabel(w: Wallpaper, t: TFunction): string {
  if (w.width_cm != null && w.total_length_m != null) {
    return t("dokon.wp.dim_roll", { w: w.width_cm, l: w.total_length_m });
  }
  if (w.width_cm != null && w.height_cm != null) {
    return t("dokon.wp.dim_panel", { w: w.width_cm, h: w.height_cm });
  }
  if (w.width_cm != null) return t("dokon.wp.dim_single", { v: w.width_cm });
  if (w.height_cm != null) return t("dokon.wp.dim_single", { v: w.height_cm });
  return "";
}

/**
 * Wallpaper (oboy) image library — the same one the studio's "Oboy" picker
 * draws from. Unlike shops/3D models these are plain images, but they can
 * now optionally belong to a shop too (same store_id shape as Furniture).
 *
 * `storeId` undefined → the overview page's global-library view (shows only
 * unassigned oboy, "+ Oboy qo'shish" lets the admin pick any shop or leave it
 * unassigned). `storeId` set → a shop profile's own scoped view (only that
 * shop's oboy, add dialog pins to it).
 */
export function WallpaperSection({
  stores,
  storeId,
  onError,
}: {
  stores: AdminStore[];
  storeId?: string;
  onError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [editingWallpaper, setEditingWallpaper] = useState<Wallpaper | null>(null);

  const { data: allWallpapers = [] } = useQuery<Wallpaper[]>({
    queryKey: ["wallpapers", storeId ?? "all"],
    queryFn: () => listWallpapers(storeId ? { store_id: storeId } : {}),
  });
  // The overview's global view only wants unassigned entries — a shop's own
  // oboy show up on that shop's profile instead, not duplicated here.
  const wallpapers = storeId ? allWallpapers : allWallpapers.filter((w) => !w.store_id);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWallpaper(id),
    onSuccess: () => {
      onError(null);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    },
    onError: (err) => onError(errorMessage(err, t("seller.remove_failed"))),
  });

  async function handleDelete(wallpaper: Wallpaper) {
    if (!(await confirm({ title: t("dokon.wp.delete_confirm", { name: wallpaper.name }), destructive: true }))) return;
    deleteMutation.mutate(wallpaper.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-on-app">{storeId ? t("dokon.wp.title_store") : t("dokon.wp.title_unassigned")}</h2>
          {!storeId && (
            <p className="text-xs text-on-app-muted mt-0.5">
              {t("dokon.wp.hint_unassigned")}
            </p>
          )}
        </div>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
          {t("dokon.wp.add")}
        </Button>
      </div>

      {wallpapers.length === 0 ? (
        <Card className="text-center text-sm text-ink-muted py-8">
          {storeId ? t("dokon.wp.none_store") : t("dokon.wp.none_all")}
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {wallpapers.map((w) => (
            <Card
              key={w.id}
              size="sm"
              interactive
              onClick={() => setEditingWallpaper(w)}
              className="relative space-y-1.5"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(w);
                }}
                title={t("common.ochirish")}
                className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-card/90 border border-line shadow-sm flex items-center justify-center text-ink-muted hover:text-red-500 transition-colors"
              >
                <Trash2 size={13} />
              </button>
              <img
                src={w.url}
                alt={w.name}
                className="w-full aspect-square rounded-lg object-cover border border-line"
              />
              <p className="text-xs font-medium text-ink truncate" title={w.name}>{w.name}</p>
              {dimensionsLabel(w, t) && (
                <p className="text-[11px] text-ink-muted">{dimensionsLabel(w, t)}</p>
              )}
              {w.price_uzs != null && (
                <p className="text-xs text-ink-muted">{t("common.price_som", { price: w.price_uzs.toLocaleString(intlLocale()) })}</p>
              )}
              {w.description && (
                <p className="text-[11px] text-ink-muted line-clamp-2" title={w.description}>
                  {w.description}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <WallpaperFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        stores={stores}
        fixedStoreId={storeId}
        onError={onError}
      />
      <WallpaperEditDialog
        wallpaper={editingWallpaper}
        open={!!editingWallpaper}
        onOpenChange={(open) => !open && setEditingWallpaper(null)}
        stores={stores}
        onError={onError}
      />
    </div>
  );
}
