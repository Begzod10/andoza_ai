import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { applyForStore, type SellerStore } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

/** First step of becoming a seller: the shop's details. It goes to the admins
 *  for approval before anything is visible. */
export function StoreApplyForm({ onApplied }: { onApplied: (store: SellerStore) => void }) {
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [error, setError] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () =>
      applyForStore({
        name: name.trim(),
        district: district.trim() || null,
        phone: phone.trim() || null,
        telegram: telegram.trim() || null,
      }),
    onSuccess: onApplied,
    onError: (err) => setError(errorMessage(err, "Arizani yuborib bo'lmadi")),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (name.trim()) apply.mutate();
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-extrabold text-ink">Sotuvchi bo'ling</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Do'koningiz ma'lumotlarini kiriting. Administrator tasdiqlagach, 3D mebel modellaringizni yuklab,
          ularni barcha foydalanuvchilarga ko'rsatishingiz mumkin.
        </p>
      </div>

      <Input label="Do'kon nomi" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Mebel Plus" autoFocus themed />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Tuman" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Chilonzor" themed />
        <Input label="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" themed />
      </div>
      <Input label="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@mebelplus" themed />

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={!name.trim()} loading={apply.isPending} size="lg" className="w-full">
        Ariza yuborish
      </Button>
    </form>
  );
}
