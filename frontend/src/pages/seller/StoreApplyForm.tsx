import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { applyForStore, type SellerStore } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";
import { isUzPhone } from "@/lib/phone";

/** First step of becoming a seller: the shop's details. It goes to the admins
 *  for approval before anything is visible. */
export function StoreApplyForm({ onApplied }: { onApplied: (store: SellerStore) => void }) {
  const { t } = useTranslation();
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
    onError: (err) => setError(errorMessage(err, t("seller.apply_failed"))),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (phone.trim() && !isUzPhone(phone)) { setError(t("common.telefon_xato")); return; }
        if (name.trim()) apply.mutate();
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-extrabold text-ink">{t("seller.apply_title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t("seller.apply_intro")}
        </p>
      </div>

      <Input label={t("seller.shop_name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("seller.shop_name_ph")} autoFocus themed />
      <div className="grid grid-cols-2 gap-3">
        <Input label={t("seller.district")} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={t("seller.district_ph")} themed />
        <Input label={t("common.telefon")} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" themed />
      </div>
      <Input label="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@mebelplus" themed />

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={!name.trim()} loading={apply.isPending} size="lg" className="w-full">
        {t("seller.apply_submit")}
      </Button>
    </form>
  );
}
