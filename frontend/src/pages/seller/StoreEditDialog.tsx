import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateMyStore, type SellerStore } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

export function StoreEditDialog({
  store,
  open,
  onOpenChange,
  onSaved,
}: {
  store: SellerStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (store: SellerStore) => void;
}) {
  const [name, setName] = useState(store.name);
  const [district, setDistrict] = useState(store.district ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [telegram, setTelegram] = useState(store.telegram ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateMyStore({
        name: name.trim(),
        district: district.trim() || null,
        phone: phone.trim() || null,
        telegram: telegram.trim() || null,
      }),
    onSuccess: (saved) => {
      onSaved(saved);
      onOpenChange(false);
    },
    onError: (err) => setError(errorMessage(err, "Saqlab bo'lmadi")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Do'kon ma'lumotlari">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (name.trim()) save.mutate();
        }}
        className="space-y-4"
      >
        <Input label="Do'kon nomi" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tuman" value={district} onChange={(e) => setDistrict(e.target.value)} />
          <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Input label="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={() => onOpenChange(false)}>Bekor qilish</Button>
          <Button type="submit" disabled={!name.trim()} loading={save.isPending}>Saqlash</Button>
        </div>
      </form>
    </Dialog>
  );
}
