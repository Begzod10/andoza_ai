import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateMyModel, type SellerModel } from "@/lib/api";
import { StyleChips } from "@/components/dokon/StyleChips";
import { knownStyles, stylesPatch, type FurnitureStyle } from "@/lib/furnitureStyles";
import { type FormError, formErrorText, requestError } from "@/lib/formError";

/** Name, price and styles. The 3D file itself is not replaceable — upload a new model
 *  instead, which goes back through review. */
export function ModelEditDialog({
  model,
  onClose,
  onSaved,
}: {
  model: SellerModel;
  onClose: () => void;
  onSaved: (m: SellerModel) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(model.name_uz);
  const [price, setPrice] = useState(model.price_uzs != null ? String(model.price_uzs) : "");
  const [styles, setStyles] = useState<FurnitureStyle[]>(() => knownStyles(model.styles));
  const [error, setError] = useState<FormError>(null);

  const save = useMutation({
    mutationFn: () =>
      updateMyModel(model.id, {
        name_uz: name.trim(),
        price_uzs: price ? Number(price) : null,
        ...stylesPatch(knownStyles(model.styles), styles, model.styles_source),
      }),
    onSuccess: (saved) => {
      onSaved(saved);
      onClose();
    },
    onError: (err) => setError(requestError(err, "seller.save_failed")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t("dokon.model.edit_title")} themed>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (name.trim()) save.mutate();
        }}
        className="space-y-4"
      >
        <Input themed label={t("dokon.admin.nomi")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input themed label={t("dokon.admin.narxi_som")} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        <StyleChips value={styles} onChange={setStyles} />
        {error && <p role="alert" className="text-sm text-red-500">{formErrorText(t, error)}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={onClose}>{t("common.bekor")}</Button>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>{t("common.saqlash")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
