import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateMyModel, type SellerModel } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

/** Name and price. The 3D file itself is not replaceable — upload a new model
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
  const [name, setName] = useState(model.name_uz);
  const [price, setPrice] = useState(model.price_uzs != null ? String(model.price_uzs) : "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateMyModel(model.id, { name_uz: name.trim(), price_uzs: price ? Number(price) : null }),
    onSuccess: (saved) => {
      onSaved(saved);
      onClose();
    },
    onError: (err) => setError(errorMessage(err, "Saqlab bo'lmadi")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Modelni tahrirlash">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (name.trim()) save.mutate();
        }}
        className="space-y-4"
      >
        <Input label="Nomi" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Narxi (so'm)" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={onClose}>Bekor qilish</Button>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>Saqlash</Button>
        </div>
      </form>
    </Dialog>
  );
}
