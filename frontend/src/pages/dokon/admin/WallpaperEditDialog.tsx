import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { updateWallpaper, type AdminStore, type Wallpaper } from "@/lib/api";
import { errorMessage } from "./errorMessage";

/** Edit an existing oboy's metadata — name/shop/price/dimensions/details.
 * The image itself isn't editable here — delete and re-upload instead. */
export function WallpaperEditDialog({
  wallpaper,
  open,
  onOpenChange,
  stores,
  onError,
}: {
  wallpaper: Wallpaper | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: AdminStore[];
  onError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [priceUzs, setPriceUzs] = useState("");
  const [description, setDescription] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [totalLengthM, setTotalLengthM] = useState("");

  // Re-seed the form whenever a different oboy is opened for editing.
  useEffect(() => {
    if (!wallpaper) return;
    setName(wallpaper.name);
    setStoreId(wallpaper.store_id ?? "");
    setPriceUzs(wallpaper.price_uzs != null ? String(wallpaper.price_uzs) : "");
    setDescription(wallpaper.description ?? "");
    setWidthCm(wallpaper.width_cm != null ? String(wallpaper.width_cm) : "");
    setHeightCm(wallpaper.height_cm != null ? String(wallpaper.height_cm) : "");
    setTotalLengthM(wallpaper.total_length_m != null ? String(wallpaper.total_length_m) : "");
  }, [wallpaper]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!wallpaper) throw new Error("Oboy tanlanmagan");
      return updateWallpaper(wallpaper.id, {
        name,
        store_id: storeId || null,
        price_uzs: priceUzs ? Number(priceUzs) : null,
        description: description.trim() || null,
        width_cm: widthCm ? Number(widthCm) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        total_length_m: totalLengthM ? Number(totalLengthM) : null,
      });
    },
    onSuccess: () => {
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    },
    onError: (err) => onError(errorMessage(err, "Oboyni yangilab bo'lmadi")),
  });

  if (!wallpaper) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Oboyni tahrirlash" description={wallpaper.name}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          updateMutation.mutate();
        }}
        className="space-y-4"
      >
        <img
          src={wallpaper.url}
          alt={wallpaper.name}
          className="w-24 h-24 rounded-lg object-cover border border-neutral-200"
        />

        <Input label="Nomi" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Do'kon" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">— tanlanmagan —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Input
            label="Narxi (so'm)"
            type="number"
            min={0}
            value={priceUzs}
            onChange={(e) => setPriceUzs(e.target.value)}
            placeholder="85000"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Kengligi (sm)"
            type="number"
            min={0}
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            placeholder="53"
          />
          <Input
            label="Balandligi (sm)"
            type="number"
            min={0}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="270"
          />
          <Input
            label="Uzunligi (m)"
            type="number"
            min={0}
            step="0.01"
            value={totalLengthM}
            onChange={(e) => setTotalLengthM(e.target.value)}
            placeholder="10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-900 mb-1.5">Tafsilotlar</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Material, o'lchami va boshqa izohlar"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={updateMutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
