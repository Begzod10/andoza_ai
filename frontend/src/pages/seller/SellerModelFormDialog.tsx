import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_FURNITURE_CATEGORIES,
  ADMIN_PLACEMENTS,
  ADMIN_ROOM_TYPES,
  createPhotoModel,
  fetchPhotoModelGlb,
  uploadMyModel,
  waitForRender,
  type AdminFurnitureCategory,
  type AdminPlacement,
  type AdminRoomType,
} from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";
import { CATEGORY_LABELS, PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "@/pages/dokon/admin/labels";
import { ModelPreview3D } from "@/pages/dokon/admin/ModelPreview3D";

const MAX_GLB_MB = 50;
const MAX_THUMB_BYTES = 5 * 1024 * 1024; // the server's cap on the preview picture
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // what Tripo accepts

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
  // Building the model from a photo takes a minute or two.
  const [building, setBuilding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  function reset() {
    abortRef.current?.abort();
    setNameUz(""); setCategory("divan"); setRoomType(""); setPlacement("pol");
    setPriceUzs(""); setFile(null); setThumbnail(null); setError(null); setBuilding(false);
  }

  /** A seller with only a product photo: have the server build the 3D model from
   *  it. The result lands in the same slots a hand-picked file would, so it is
   *  previewed, named and uploaded the normal way — and still waits for review.
   *  The photo itself becomes the preview picture. */
  async function buildFromPhoto(photo: File) {
    setError(null);
    if (photo.size > MAX_PHOTO_BYTES) {
      setError("Rasm 20 MB dan kichik bo'lishi kerak");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBuilding(true);
    try {
      const { job_id } = await createPhotoModel(photo);
      const outcome = await waitForRender(job_id, controller.signal);
      const glb = await fetchPhotoModelGlb(outcome.key);
      const base = photo.name.replace(/\.[^.]+$/, "") || "model";
      setFile(new File([glb], `${base}.glb`, { type: "model/gltf-binary" }));
      if (photo.size <= MAX_THUMB_BYTES) setThumbnail(photo);
      if (!nameUz.trim()) setNameUz(base);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorMessage(err, "Modelni yaratib bo'lmadi"));
    } finally {
      if (!controller.signal.aborted) setBuilding(false);
    }
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
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (nameUz.trim() && file) upload.mutate();
        }}
        className="space-y-4"
      >
        <Input label="Nomi" value={nameUz} onChange={(e) => setNameUz(e.target.value)} placeholder="Masalan: Uch o'rinli divan" autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Turi" value={category} onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}>
            {ADMIN_FURNITURE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Select label="Xona" value={roomType} onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}>
            <option value="">Barcha xonalar</option>
            {ADMIN_ROOM_TYPES.map((r) => <option key={r} value={r}>{ROOM_TYPE_LABELS[r]}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Xonada joylashuvi" value={placement} onChange={(e) => setPlacement(e.target.value as AdminPlacement)}>
            {ADMIN_PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>)}
          </Select>
          <Input label="Narxi (so'm)" type="number" min={0} value={priceUzs} onChange={(e) => setPriceUzs(e.target.value)} placeholder="4500000" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-1.5">3D model (.glb)</label>
            <input type="file" accept=".glb" onChange={(e) => pickModel(e.target.files?.[0] ?? null)} disabled={building} className="text-xs w-full" />
            {file && <p className="mt-1 text-xs text-neutral-500 truncate">{file.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-1.5">Rasm (ixtiyoriy)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)} className="text-xs w-full" />
          </div>
        </div>

        {/* No 3D file but a photo: let the server build one (Tripo). */}
        <div className="rounded-xl border border-dashed border-neutral-300 p-3 space-y-2">
          <label className="block text-sm font-medium text-neutral-900">Faylingiz yo'qmi? Rasmdan yarating</label>
          <p className="text-xs text-neutral-500">
            Mebelning aniq rasmini yuklang (toza fon yaxshi) — 3D model avtomatik yaratiladi, taxminan 1–2 daqiqa.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Rasmdan 3D model yaratish"
            disabled={building}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void buildFromPhoto(f);
            }}
            className="text-xs w-full"
          />
          {building && (
            <p role="status" className="flex items-center gap-2 text-xs font-medium text-brand">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" aria-hidden />
              Model yaratilmoqda (1–2 daqiqa)...
            </p>
          )}
        </div>

        <ModelPreview3D file={file} />

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button type="submit" disabled={!nameUz.trim() || !file || building} loading={upload.isPending}>Yuklash</Button>
        </div>
      </form>
    </Dialog>
  );
}
