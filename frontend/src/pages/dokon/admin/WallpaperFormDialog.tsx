import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { uploadWallpaper, type AdminStore } from "@/lib/api";
import { errorMessage } from "./errorMessage";

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
  onError: (msg: string | null) => void;
}) {
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
      if (!file) throw new Error("Rasm tanlanmagan");
      return uploadWallpaper(file, {
        name: name.trim() || undefined,
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
    onError: (err) => onError(errorMessage(err, "Rasmni yuklab bo'lmadi")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Yangi oboy"
      description="Rasm, nomi, narxi va tafsilotlarini kiriting"
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
          <label className="block text-sm font-medium text-neutral-900 mb-1.5">Rasm (.jpg, .png, .webp)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs w-full"
          />
        </div>

        <Input
          label="Nomi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={file?.name || "Masalan: Gulli oboy"}
        />

        <div className="grid grid-cols-2 gap-3">
          {fixedStoreId === undefined && (
            <Select label="Do'kon" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">— tanlanmagan —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
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
        <p className="text-xs text-neutral-400 -mt-2">
          Rulon oboy uchun kengligi + uzunligi; bitta panelli (fototapeta) oboy uchun kengligi + balandligi
        </p>

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
          <Button type="submit" disabled={!file} loading={uploadMutation.isPending}>
            Qo'shish
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
