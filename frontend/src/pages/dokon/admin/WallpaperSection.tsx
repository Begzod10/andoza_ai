import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { deleteWallpaper, listWallpapers, type AdminStore, type Wallpaper } from "@/lib/api";
import { errorMessage } from "./errorMessage";
import { WallpaperEditDialog } from "./WallpaperEditDialog";
import { WallpaperFormDialog } from "./WallpaperFormDialog";

/** "53 sm × 10 m" for a roll, "300 × 270 sm" for a fixed panel, or just the
 * width alone when that's all that's set. Empty when nothing is set. */
function dimensionsLabel(w: Wallpaper): string {
  if (w.width_cm != null && w.total_length_m != null) {
    return `${w.width_cm} sm × ${w.total_length_m} m`;
  }
  if (w.width_cm != null && w.height_cm != null) {
    return `${w.width_cm} × ${w.height_cm} sm`;
  }
  if (w.width_cm != null) return `${w.width_cm} sm`;
  if (w.height_cm != null) return `${w.height_cm} sm`;
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
  const queryClient = useQueryClient();
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
    onError: (err) => onError(errorMessage(err, "O'chirib bo'lmadi")),
  });

  function handleDelete(wallpaper: Wallpaper) {
    if (!window.confirm(`"${wallpaper.name}" hamma foydalanuvchilar uchun o'chirilsinmi?`)) return;
    deleteMutation.mutate(wallpaper.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">{storeId ? "Oboylar" : "Do'konsiz oboylar"}</h2>
          {!storeId && (
            <p className="text-xs text-neutral-400 mt-0.5">
              3D model emas — rasm sifatida saqlanadi va devor bezashda ishlatiladi
            </p>
          )}
        </div>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
          Oboy qo'shish
        </Button>
      </div>

      {wallpapers.length === 0 ? (
        <Card className="text-center text-sm text-neutral-400 py-8">
          {storeId ? "Bu do'konda hali oboy yo'q" : "Barcha oboylar biror do'konga biriktirilgan"}
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
                title="O'chirish"
                className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-white/90 border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={13} />
              </button>
              <img
                src={w.url}
                alt={w.name}
                className="w-full aspect-square rounded-lg object-cover border border-neutral-200"
              />
              <p className="text-xs font-medium text-neutral-700 truncate" title={w.name}>{w.name}</p>
              {dimensionsLabel(w) && (
                <p className="text-[11px] text-neutral-400">{dimensionsLabel(w)}</p>
              )}
              {w.price_uzs != null && (
                <p className="text-xs text-neutral-500">{w.price_uzs.toLocaleString("uz-UZ")} so'm</p>
              )}
              {w.description && (
                <p className="text-[11px] text-neutral-400 line-clamp-2" title={w.description}>
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
