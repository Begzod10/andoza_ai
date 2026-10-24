import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      if (!wallpaper) throw new Error(t("dokon.wp.no_wallpaper"));
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
    onError: (err) => onError(errorMessage(err, t("dokon.wp.update_failed"))),
  });

  if (!wallpaper) return null;

  return (
    <Dialog themed open={open} onOpenChange={onOpenChange} title={t("dokon.wp.edit_title")} description={wallpaper.name}>
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
          className="w-24 h-24 rounded-lg object-cover border border-line"
        />

        <Input themed label={t("dokon.admin.nomi")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.dokon")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">{t("dokon.admin.not_selected")}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Input themed
            label={t("dokon.admin.narxi_som")}
            type="number"
            min={0}
            value={priceUzs}
            onChange={(e) => setPriceUzs(e.target.value)}
            placeholder="85000"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input themed
            label={t("dokon.wp.width")}
            type="number"
            min={0}
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            placeholder="53"
          />
          <Input themed
            label={t("dokon.wp.height")}
            type="number"
            min={0}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="270"
          />
          <Input themed
            label={t("dokon.wp.length")}
            type="number"
            min={0}
            step="0.01"
            value={totalLengthM}
            onChange={(e) => setTotalLengthM(e.target.value)}
            placeholder="10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("dokon.wp.details")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("dokon.wp.details_ph")}
            className="w-full rounded-xl border border-line bg-card-soft px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
            {t("common.bekor")}
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={updateMutation.isPending}>
            {t("common.saqlash")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
