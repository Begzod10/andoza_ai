import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { errorMessage } from "./errorMessage";
import { CATEGORY_LABELS, PLACEMENT_LABELS, ROOM_TYPE_LABELS } from "./labels";

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
  onError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [nameUz, setNameUz] = useState("");
  const [category, setCategory] = useState<AdminFurnitureCategory>("boshqa");
  const [roomType, setRoomType] = useState<AdminRoomType | "">("");
  const [placement, setPlacement] = useState<AdminPlacement>("pol");
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
    setStoreId(model.store_id ?? "");
    setPriceUzs(model.price_uzs != null ? String(model.price_uzs) : "");
    setIsActive(model.is_active);
  }, [model]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!model) throw new Error("Model tanlanmagan");
      return updateAdminFurniture(model.id, {
        name_uz: nameUz,
        category,
        room_type: roomType || null,
        placement,
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
    onError: (err) => onError(errorMessage(err, "Modelni yangilab bo'lmadi")),
  });

  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Modelni tahrirlash" description={model.name_uz}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nameUz.trim()) return;
          updateMutation.mutate();
        }}
        className="space-y-4"
      >
        <Input label="Nomi" value={nameUz} onChange={(e) => setNameUz(e.target.value)} autoFocus />

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
          value={placement}
          onChange={(e) => setPlacement(e.target.value as AdminPlacement)}
        >
          {ADMIN_PLACEMENTS.map((p) => (
            <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
          ))}
        </Select>

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
            placeholder="4500000"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-neutral-300 text-brand focus:ring-brand"
          />
          Faol (katalogda ko'rinadi)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={!nameUz.trim()} loading={updateMutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
