import { useEffect, useState } from "react";
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
  updateAdminFurniture,
  type AdminFurniture,
  type AdminFurnitureCategory,
  type AdminPlacement,
  type AdminRoomType,
  type AdminStore,
} from "@/lib/api";
import { StyleChips } from "@/components/dokon/StyleChips";
import { knownStyles, stylesPatch, type FurnitureStyle } from "@/lib/furnitureStyles";
import { CATEGORY_KEYS, PLACEMENT_KEYS, ROOM_TYPE_KEYS } from "./labels";
import { requestError, type FormError } from "@/lib/formError";

/**
 * Edit an existing 3D model's metadata. The GLB/thumbnail file itself isn't
 * editable here — the backend deliberately doesn't support replacing it
 * (delete and re-upload instead), so this only covers the fields that are.
 */
export function ModelEditDialog({
  model,
  open,
  onOpenChange,
  stores,
  onError,
}: {
  model: AdminFurniture | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: AdminStore[];
  onError: (msg: FormError) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("boshqa");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [placement, setPlacement] = useState<AdminPlacement>("pol");
  const [styles, setStyles] = useState<FurnitureStyle[]>([]);
  const [storeId, setStoreId] = useState("");
  const [priceUzs, setPriceUzs] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Re-seed the form whenever a different model is opened for editing.
  useEffect(() => {
    if (!model) return;
    setNameUz(model.name_uz);
    setCategory(model.category as AdminFurnitureCategory);
    setRoomType((model.room_type as AdminRoomType) ?? "");
    setPlacement(model.placement);
    setStyles(knownStyles(model.styles));
    setStoreId(model.store_id ?? "");
    setPriceUzs(model.price_uzs != null ? String(model.price_uzs) : "");
    setIsActive(model.is_active);
  }, [model]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!model) throw new Error(t("dokon.model.no_model"));
      return updateAdminFurniture(model.id, {
        name_uz: nameUz,
        category,
        room_type: roomType || null,
        placement,
        ...stylesPatch(knownStyles(model.styles), styles, model.styles_source),
        store_id: storeId || null,
        price_uzs: priceUzs ? Number(priceUzs) : null,
        is_active: isActive,
      });
    },
    onSuccess: () => {
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "furniture"] });
    },
    onError: (err) => onError(requestError(err, "dokon.model.update_failed")),
  });

  if (!model) return null;

  return (
    <Dialog themed open={open} onOpenChange={onOpenChange} title={t("dokon.model.edit_title")} description={model.name_uz}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameUz.trim()) return;
          updateMutation.mutate();
        }}
        className="space-y-4"
      >
        <Input themed label={t("dokon.admin.nomi")} value={nameUz} onChange={(e) => setNameUz(e.target.value)} autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.turi")} value={category} onChange={(e) => setCategory(e.target.value as AdminFurnitureCategory)}>
            {ADMIN_FURNITURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(CATEGORY_KEYS[c])}</option>
            ))}
          </Select>
          <Select themed label={t("dokon.admin.xona")} value={roomType} onChange={(e) => setRoomType(e.target.value as AdminRoomType | "")}>
            <option value="">{t("dokon.admin.all_rooms")}</option>
            {ADMIN_ROOM_TYPES.map((r) => (
              <option key={r} value={r}>{t(ROOM_TYPE_KEYS[r])}</option>
            ))}
          </Select>
        </div>

        <StyleChips value={styles} onChange={setStyles} />
        {model?.styles_source === "ai" && (
          <p className="text-xs text-ink-muted -mt-2">{t("dokon.model.ai_styles")}</p>
        )}

        <Select themed
          label={t("dokon.admin.placement")}
          value={placement}
          onChange={(e) => setPlacement(e.target.value as AdminPlacement)}
        >
          {ADMIN_PLACEMENTS.map((p) => (
            <option key={p} value={p}>{t(PLACEMENT_KEYS[p])}</option>
          ))}
        </Select>

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
            placeholder="4500000"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-line text-brand focus:ring-brand"
          />
          {t("dokon.model.active")}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
            {t("common.bekor")}
          </Button>
          <Button type="submit" disabled={!nameUz.trim()} loading={updateMutation.isPending}>
            {t("common.saqlash")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
