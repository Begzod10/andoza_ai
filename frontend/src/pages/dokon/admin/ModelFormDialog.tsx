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
  uploadAdminFurniture,
  type AdminFurnitureCategory,
  type AdminPlacement,
  type AdminRoomType,
  type AdminStore,
} from "@/lib/api";
import { errorMessage } from "./errorMessage";
import { CATEGORY_LABELS, PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "./labels";
import { ModelPreview3D } from "./ModelPreview3D";
import { objFilesToGlb, UNIT_LABELS, type ConvertedModel, type ModelUnit } from "@/lib/objToGlb";

/**
 * Dialog form for uploading a 3D model. When opened from a shop's profile,
 * `fixedStoreId` pins the model to that shop and hides the shop picker —
 * from the general catalog view, `fixedStoreId` is undefined and the admin
 * picks a shop (or leaves it unassigned) from the full list.
 */
export function ModelFormDialog({
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
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("divan");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [placement, setPlacement] = useState<AdminPlacement>("pol");
  const [storeId, setStoreId] = useState("");
  const [priceUzs, setPriceUzs] = useState("");
  // Always a `.glb` ready to upload — a picked .obj is converted to GLB in the
  // browser (bundling its .mtl + textures) before it lands here.
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  // OBJ import: the raw picked files are kept so the model can be re-converted
  // when the admin changes the source unit; `sizeM` shows the resulting real
  // size so a wrong unit is obvious ("0.30 m chair" → switch to Dyuym).
  const [objFiles, setObjFiles] = useState<File[] | null>(null);
  const [unit, setUnit] = useState<ModelUnit>("auto");
  const [sizeM, setSizeM] = useState<ConvertedModel["sizeM"] | null>(null);

  function reset() {
    setNameUz("");
    setCategory("divan");
    setRoomType("");
    setPlacement("pol");
    setStoreId("");
    setPriceUzs("");
    setFile(null);
    setThumbnail(null);
    setConverting(false);
    setObjFiles(null);
    setUnit("auto");
    setSizeM(null);
  }

  async function convertObj(picked: File[], withUnit: ModelUnit) {
    setConverting(true);
    setFile(null);
    onError(null);
    try {
      const { file: glb, sizeM: size } = await objFilesToGlb(picked, withUnit);
      setFile(glb);
      setSizeM(size);
    } catch (err) {
      onError(errorMessage(err, "OBJ faylni GLB ga aylantirib bo'lmadi"));
    } finally {
      setConverting(false);
    }
  }

  async function handleModelFiles(fileList: FileList | null) {
    const picked = fileList ? Array.from(fileList) : [];
    setObjFiles(null);
    setSizeM(null);
    if (picked.length === 0) {
      setFile(null);
      return;
    }
    const glb = picked.find((f) => f.name.toLowerCase().endsWith(".glb"));
    if (glb) {
      // A ready-made GLB — use it directly (ignores any extra picked files).
      setFile(glb);
      return;
    }
    if (!picked.some((f) => f.name.toLowerCase().endsWith(".obj"))) {
      onError("Iltimos .glb yoki .obj fayl tanlang");
      setFile(null);
      return;
    }
    // OBJ: convert to a self-contained GLB in the browser at the chosen unit.
    setObjFiles(picked);
    await convertObj(picked, unit);
  }

  function handleUnitChange(next: ModelUnit) {
    setUnit(next);
    if (objFiles) void convertObj(objFiles, next);
  }

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("GLB fayl tanlanmagan");
      return uploadAdminFurniture({
        file,
        thumbnail,
        name_uz: nameUz,
        category,
        room_type: roomType || null,
        placement,
        store_id: fixedStoreId ?? storeId ?? null,
        price_uzs: priceUzs ? Number(priceUzs) : null,
      });
    },
    onSuccess: () => {
      reset();
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    },
    onError: (err) => onError(errorMessage(err, "Modelni yuklab bo'lmadi")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Yangi 3D model"
      description="Model faylini va uning ma'lumotlarini kiriting"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameUz.trim() || !file) return;
          uploadMutation.mutate();
        }}
        className="space-y-4"
      >
        <Input
          label="Nomi"
          value={nameUz}
          onChange={(e) => setNameUz(e.target.value)}
          placeholder="Masalan: Uch o'rinli divan"
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Select label="Turi" value={category} onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}>
            {ADMIN_FURNITURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
          <Select label="Xona" value={roomType} onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}>
            <option value="">Barcha xonalar</option>
            {ADMIN_ROOM_TYPES.map((r) => (
              <option key={r} value={r}>{ROOM_TYPE_LABELS[r]}</option>
            ))}
          </Select>
        </div>

        <Select
          label="Xonada joylashuvi"
          helperText="Model xona ichida qayerga o'rnatilishi"
          value={placement}
          onChange={(e) => setPlacement(e.target.value as AdminPlacement)}
        >
          {ADMIN_PLACEMENTS.map((p) => (
            <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
          ))}
        </Select>

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
            placeholder="4500000"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-1.5">3D model (.glb yoki .obj)</label>
            <input
              type="file"
              multiple
              accept=".glb,.obj,.mtl,image/*"
              onChange={(e) => void handleModelFiles(e.target.files)}
              className="text-xs w-full"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              OBJ uchun .obj bilan birga .mtl va tekstura rasmlarini ham tanlang — brauzerda .glb ga aylantiriladi.
            </p>
            {converting && <p className="text-[11px] text-brand-600 mt-1">GLB ga aylantirilmoqda…</p>}
            {objFiles && (
              <div className="mt-2 space-y-1">
                <Select
                  label="Model o'lchami (birlik)"
                  value={unit}
                  onChange={(e) => handleUnitChange(e.target.value as ModelUnit)}
                >
                  {(Object.keys(UNIT_LABELS) as ModelUnit[]).map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                  ))}
                </Select>
                {sizeM && (
                  <p className="text-[11px] text-neutral-500">
                    O'lcham ≈ {sizeM.w} × {sizeM.d} × {sizeM.h} m — noto'g'ri bo'lsa birlikni o'zgartiring.
                  </p>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-1.5">Rasm (ixtiyoriy)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
              className="text-xs w-full"
            />
          </div>
        </div>

        <ModelPreview3D file={file} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={!nameUz.trim() || !file || converting} loading={uploadMutation.isPending || converting}>
            Yuklash
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
