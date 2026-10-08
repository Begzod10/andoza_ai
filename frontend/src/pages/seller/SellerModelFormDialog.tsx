import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_FURNITURE_CATEGORIES,
  ADMIN_PLACEMENTS,
  ADMIN_ROOM_TYPES,
  uploadMyModel,
  type AdminFurnitureCategory,
  type AdminPlacement,
  type AdminRoomType,
} from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";
import { CATEGORY_LABELS, PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "@/pages/dokon/admin/labels";
import { ModelPreview3D } from "@/pages/dokon/admin/ModelPreview3D";
import { PhotoToModelField } from "@/components/studio/PhotoToModelField";

const MAX_GLB_MB = 50;

/** Upload a 3D model (.glb) into the seller's own shop. The server checks the
 *  file for real; this only catches the obvious mistakes before a slow upload. */
export function SellerModelFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("divan");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [placement, setPlacement] = useState<AdminPlacement>("pol");
  const [priceUzs, setPriceUzs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True while a model is being built from a photo (a minute or two).
  const [building, setBuilding] = useState(false);

  function reset() {
    setNameUz(""); setCategory("divan"); setRoomType(""); setPlacement("pol");
    setPriceUzs(""); setFile(null); setThumbnail(null); setError(null);
  }

  function pickModel(f: File | null) {
    setError(null);
    if (f && !f.name.toLowerCase().endsWith(".glb")) {
      setError("Fayl .glb formatida bo'lishi kerak");
      return;
    }
    if (f && f.size > MAX_GLB_MB * 1024 * 1024) {
      setError(`Fayl hajmi ${MAX_GLB_MB} MB dan oshmasligi kerak`);
      return;
    }
    setFile(f);
  }

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("GLB fayl tanlanmagan");
      return uploadMyModel({
        file,
        thumbnail,
        name_uz: nameUz.trim(),
        category,
        room_type: roomType || null,
        placement,
        price_uzs: priceUzs ? Number(priceUzs) : null,
      });
    },
    onSuccess: () => {
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["seller", "models"] });
    },
    onError: (err) => setError(errorMessage(err, "Modelni yuklab bo'lmadi")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Yangi 3D model"
      description="Yuklangan model administrator tasdiqlagach, hammaga ko'rinadi"
      themed
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (nameUz.trim() && file) upload.mutate();
        }}
        className="space-y-4"
      >
        <Input themed label="Nomi" value={nameUz} onChange={(e) => setNameUz(e.target.value)} placeholder="Masalan: Uch o'rinli divan" autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label="Turi" value={category} onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}>
            {ADMIN_FURNITURE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Select themed label="Xona" value={roomType} onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}>
            <option value="">Barcha xonalar</option>
            {ADMIN_ROOM_TYPES.map((r) => <option key={r} value={r}>{ROOM_TYPE_LABELS[r]}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select themed label="Xonada joylashuvi" value={placement} onChange={(e) => setPlacement(e.target.value as AdminPlacement)}>
            {ADMIN_PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>)}
          </Select>
          <Input themed label="Narxi (so'm)" type="number" min={0} value={priceUzs} onChange={(e) => setPriceUzs(e.target.value)} placeholder="4500000" />
        </div>

        {/* Most sellers have photos, not a 3D file: the photo is the main way in
            and the server builds the model (Tripo). */}
        <PhotoToModelField
          themed
          title="Mebel rasmini yuklang — 3D modelni o'zimiz yaratamiz"
          onBusyChange={setBuilding}
          onError={setError}
          onBuilt={({ file: built, thumbnail: pic, baseName }) => {
            setFile(built);
            if (pic) setThumbnail(pic);
            if (!nameUz.trim()) setNameUz(baseName);
          }}
        />

        {file && <p className="text-xs text-ink-muted truncate">3D model tayyor: <span>{file.name}</span></p>}

        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">Menda tayyor 3D fayl (.glb) bor</summary>
          <div className="mt-2">
            <input type="file" accept=".glb" onChange={(e) => pickModel(e.target.files?.[0] ?? null)} disabled={building} className="text-xs w-full" />
          </div>
        </details>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Katalog uchun rasm (ixtiyoriy)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)} className="text-xs w-full" />
        </div>

        <ModelPreview3D file={file} />

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button type="submit" disabled={!nameUz.trim() || !file || building} loading={upload.isPending}>Yuklash</Button>
        </div>
      </form>
    </Dialog>
  );
}
