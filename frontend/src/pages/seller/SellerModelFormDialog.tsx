import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { CATEGORY_KEYS, PLACEMENT_KEYS, ROOM_TYPE_KEYS } from "@/pages/dokon/admin/labels";
import { ModelPreview3D } from "@/pages/dokon/admin/ModelPreview3D";
import { sizeFields, type MeasuredSize } from "@/lib/modelSize";
import { StyleChips } from "@/components/dokon/StyleChips";
import type { FurnitureStyle } from "@/lib/furnitureStyles";
import { PhotoToModelField } from "@/components/studio/PhotoToModelField";
import { type FormError, formErrorText, localError, requestError } from "@/lib/formError";

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("divan");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [placement, setPlacement] = useState<AdminPlacement>("pol");
  const [styles, setStyles] = useState<FurnitureStyle[]>([]);
  const [priceUzs, setPriceUzs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [error, setError] = useState<FormError>(null);
  // The real size of the chosen model, measured from the file, stored with it.
  const [measured, setMeasured] = useState<MeasuredSize | null>(null);
  // True while a model is being built from a photo (a minute or two).
  const [building, setBuilding] = useState(false);

  function reset() {
    setNameUz(""); setCategory("divan"); setRoomType(""); setPlacement("pol"); setStyles([]);
    setPriceUzs(""); setFile(null); setThumbnail(null); setError(null);
  }

  function pickModel(f: File | null) {
    setError(null);
    if (f && !f.name.toLowerCase().endsWith(".glb")) {
      setError(localError("dokon.model.glb_wrong"));
      return;
    }
    if (f && f.size > MAX_GLB_MB * 1024 * 1024) {
      setError(localError("dokon.model.glb_big", { mb: MAX_GLB_MB }));
      return;
    }
    setFile(f);
  }

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error(t("dokon.model.no_glb"));
      return uploadMyModel({
        file,
        thumbnail,
        name_uz: nameUz.trim(),
        category,
        room_type: roomType || null,
        placement,
        styles,
        price_uzs: priceUzs ? Number(priceUzs) : null,
        ...sizeFields(measured),
      });
    },
    onSuccess: () => {
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["seller", "models"] });
    },
    onError: (err) => setError(requestError(err, "dokon.model.upload_failed")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("dokon.model.new_title")}
      description={t("dokon.model.seller_desc")}
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
        <Input themed label={t("dokon.admin.nomi")} value={nameUz} onChange={(e) => setNameUz(e.target.value)} placeholder={t("dokon.model.name_ph")} autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.turi")} value={category} onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}>
            {ADMIN_FURNITURE_CATEGORIES.map((c) => <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>)}
          </Select>
          <Select themed label={t("dokon.admin.xona")} value={roomType} onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}>
            <option value="">{t("dokon.admin.all_rooms")}</option>
            {ADMIN_ROOM_TYPES.map((r) => <option key={r} value={r}>{t(ROOM_TYPE_KEYS[r])}</option>)}
          </Select>
        </div>

        <StyleChips value={styles} onChange={setStyles} />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.placement")} value={placement} onChange={(e) => setPlacement(e.target.value as AdminPlacement)}>
            {ADMIN_PLACEMENTS.map((p) => <option key={p} value={p}>{t(PLACEMENT_KEYS[p])}</option>)}
          </Select>
          <Input themed label={t("dokon.admin.narxi_som")} type="number" min={0} value={priceUzs} onChange={(e) => setPriceUzs(e.target.value)} placeholder="4500000" />
        </div>

        {/* Most sellers have photos, not a 3D file: the photo is the main way in
            and the server builds the model (Tripo). */}
        <PhotoToModelField
          themed
          title={t("dokon.model.photo_title")}
          onBusyChange={setBuilding}
          onError={setError}
          onBuilt={({ file: built, thumbnail: pic, baseName }) => {
            setFile(built);
            if (pic) setThumbnail(pic);
            if (!nameUz.trim()) setNameUz(baseName);
          }}
        />

        {file && <p className="text-xs text-ink-muted truncate">{t("dokon.model.ready")} <span>{file.name}</span></p>}

        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">{t("dokon.model.have_glb")}</summary>
          <div className="mt-2">
            <input type="file" accept=".glb" onChange={(e) => pickModel(e.target.files?.[0] ?? null)} disabled={building} className="text-xs w-full" />
          </div>
        </details>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">{t("dokon.model.thumb_catalog")}</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)} className="text-xs w-full" />
        </div>

        <ModelPreview3D file={file} onMeasured={setMeasured} themed />

        {error && <p role="alert" className="text-sm text-red-500">{formErrorText(t, error)}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>{t("common.bekor")}</Button>
          <Button type="submit" disabled={!nameUz.trim() || !file || building} loading={upload.isPending}>{t("dokon.model.upload")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
