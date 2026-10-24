import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  MATERIAL_CATEGORIES, MATERIAL_UNITS, PACK_UNITS, SMETA_KEYS, createAdminMaterial, updateAdminMaterial,
  type AdminMaterial, type AdminStore, type MaterialInput,
} from "@/lib/api";
import { smetaKeyLabel } from "./materialLabels";
import { type FormError, formErrorText, requestError } from "@/lib/formError";

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
/** "" -> null, otherwise a number (NaN is kept so the caller can reject it). */
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Add a material, or edit one. The form is seeded from `material` each time it opens. */
export function MaterialFormDialog({ open, onOpenChange, material, stores, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: AdminMaterial | null;
  stores: AdminStore[];
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [storeId, setStoreId] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [packQty, setPackQty] = useState("");
  const [packUnit, setPackUnit] = useState("");
  // True while the pack unit is one the smeta key filled in (not one the admin picked).
  const [autofilled, setAutofilled] = useState(false);
  const [smetaKey, setSmetaKey] = useState("");
  const [rollWidth, setRollWidth] = useState("");
  const [rollLength, setRollLength] = useState("");
  const [error, setError] = useState<FormError>(null);

  useEffect(() => {
    if (!open) return;
    setStoreId(material?.store_id ?? "");
    setCategory(material?.category ?? "");
    setName(material?.name_uz ?? "");
    setUnit(material?.unit ?? "");
    setPriceStr(str(material?.price_uzs));
    setPackQty(str(material?.pack_qty));
    setPackUnit(material?.pack_unit ?? "");
    setAutofilled(false);
    setSmetaKey(material?.smeta_key ?? "");
    setRollWidth(str(material?.roll_width_cm));
    setRollLength(str(material?.roll_length_m));
    setError(null);
  }, [open, material]);

  const isOboy = category === "oboy";
  const price = num(priceStr);
  // Pack size and unit go together (the backend refuses one without the other).
  const packMismatch = !!packQty.trim() !== !!packUnit;
  const valid = !!storeId && !!category && !!name.trim() && !!unit && price != null && Number.isFinite(price) && price > 0
    && !packMismatch;

  const pickSmetaKey = (id: string) => {
    setSmetaKey(id);
    const needed = SMETA_KEYS.find((k) => k.id === id)?.packUnit ?? "";
    // Fill an empty unit, or replace one the previous key filled; never replace one the admin picked.
    // Sold by the key's own unit (e.g. plintus by the metre) it needs no pack, so leave it empty.
    if (!packUnit || autofilled) {
      const fill = needed === unit ? "" : needed;
      setPackUnit(fill);
      setAutofilled(!!fill);
    }
  };

  const pickUnit = (next: string) => {
    setUnit(next);
    // A pack unit the key filled in is pointless once the product is sold by that unit itself.
    if (autofilled && next === packUnit) {
      setPackUnit("");
      setAutofilled(false);
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const input: MaterialInput = {
        store_id: storeId,
        category,
        name_uz: name.trim(),
        unit,
        price_uzs: price as number,
        pack_qty: num(packQty),
        pack_unit: packUnit || null,
        smeta_key: smetaKey || null,
        roll_width_cm: isOboy ? num(rollWidth) : null,
        roll_length_m: isOboy ? num(rollLength) : null,
      };
      return material ? updateAdminMaterial(material.id, input) : createAdminMaterial(input);
    },
    onSuccess: () => {
      setError(null);
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) => setError(requestError(err, "dokon.admin.mat.save_failed")),
  });

  return (
    <Dialog themed open={open} onOpenChange={onOpenChange} title={material ? t("dokon.admin.mat.edit_title") : t("dokon.admin.mat.add")} description={material?.name_uz}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || save.isPending) return;
          save.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.dokon")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">{t("dokon.admin.tanlang")}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select themed label={t("dokon.admin.kategoriya")} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("dokon.admin.tanlang")}</option>
            {MATERIAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
          </Select>
        </div>

        <Input themed label={t("dokon.admin.nomi")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <div className="grid grid-cols-2 gap-3">
          <Select themed label={t("dokon.admin.mat.birlik")} value={unit} onChange={(e) => pickUnit(e.target.value)}>
            <option value="">{t("dokon.admin.tanlang")}</option>
            {MATERIAL_UNITS.map((u) => <option key={u.id} value={u.id}>{t(u.labelKey)}</option>)}
          </Select>
          <Input themed label={t("dokon.admin.narxi_som")} type="number" min={0} value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input themed label={t("dokon.admin.mat.pack_qty")} type="number" min={0} step="any" value={packQty} onChange={(e) => setPackQty(e.target.value)} />
          <Select themed label={t("dokon.admin.mat.pack_unit")} value={packUnit} onChange={(e) => { setPackUnit(e.target.value); setAutofilled(false); }}>
            <option value="">{t("dokon.admin.yoq")}</option>
            {PACK_UNITS.map((u) => <option key={u.id} value={u.id}>{t(u.labelKey)}</option>)}
          </Select>
        </div>
        {packMismatch && (
          <p className="-mt-2 text-xs text-ink-muted">{t("dokon.admin.mat.pack_together")}</p>
        )}

        <Select themed label={t("dokon.admin.mat.smeta_key")} value={smetaKey} onChange={(e) => pickSmetaKey(e.target.value)}>
          <option value="">{t("dokon.admin.yoq")}</option>
          {SMETA_KEYS.map((k) => <option key={k.id} value={k.id}>{smetaKeyLabel(k, t)}</option>)}
        </Select>

        {isOboy && (
          <div className="grid grid-cols-2 gap-3">
            <Input themed label={t("dokon.admin.mat.roll_width")} type="number" min={0} step="any" value={rollWidth} onChange={(e) => setRollWidth(e.target.value)} />
            <Input themed label={t("dokon.admin.mat.roll_length")} type="number" min={0} step="any" value={rollLength} onChange={(e) => setRollLength(e.target.value)} />
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-500">{formErrorText(t, error)}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>{t("common.bekor")}</Button>
          <Button type="submit" disabled={!valid} loading={save.isPending}>{t("common.saqlash")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
