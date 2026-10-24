import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { uploadWallpaper, type AdminStore } from "@/lib/api";
import { requestError, type FormError } from "@/lib/formError";

/**
 * Dialog form for adding an oboy: the image plus name/price/details — before
 * this, adding one skipped straight to a bare file picker with no way to
 * record what it is or what it costs. When opened from a shop's profile,
 * `fixedStoreId` pins it to that shop and hides the shop picker — same
 * pattern as ModelFormDialog.
 */
export function WallpaperFormDialog({
  open,
  onOpenChange,
  stores,
  fixedStoreId,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: AdminStore[];
  fixedStoreId?: string;
  onError: (msg: FormError) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [priceUzs, setPriceUzs] = useState("");
  const [description, setDescription] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [totalLengthM, setTotalLengthM] = useState("");

  function reset() {
    setFile(null);
    setName("");
    setStoreId("");
    setPriceUzs("");
    setDescription("");
    setWidthCm("");
    setHeightCm("");
    setTotalLengthM("");
  }

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(t("dokon.wp.no_image"));
      return uploadWallpaper(file, {
        name: name.trim() || undefined,
        // Admin-catalogued oboy products belong in the studio's Bo'yoq/Oboy
        // library, same as before scoping existed.
        kind: "oboy",
        store_id: fixedStoreId ?? storeId ?? undefined,
        price_uzs: priceUzs ? Number(priceUzs) : undefined,
        description: description.trim() || undefined,
        width_cm: widthCm ? Number(widthCm) : undefined,
        height_cm: heightCm ? Number(heightCm) : undefined,
        total_length_m: totalLengthM ? Number(totalLengthM) : undefined,
      });
    },
    onSuccess: () => {
      reset();
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    },
    onError: (err) => onError(requestError(err, "dokon.wp.upload_failed")),
  });

  return (
    <Dialog themed
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("dokon.wp.new_title")}
      description={t("dokon.wp.new_desc")}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          uploadMutation.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("dokon.wp.image_label")}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs w-full"
          />
        </div>

        <Input themed
          label={t("dokon.admin.nomi")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={file?.name || t("dokon.wp.name_ph")}
        />

        <div className="grid grid-cols-2 gap-3">
          {fixedStoreId === undefined && (
            <Select themed label={t("dokon.admin.dokon")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">{t("dokon.admin.not_selected")}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
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
        <p className="text-xs text-ink-muted -mt-2">
          {t("dokon.wp.hint")}
        </p>

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
          <Button type="submit" disabled={!file} loading={uploadMutation.isPending}>
            {t("common.qoshish")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
