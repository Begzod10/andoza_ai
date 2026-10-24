import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_PARTNER_TIERS,
  createAdminStore,
  listRegions,
  type AdminPartnerTier,
  type Region,
} from "@/lib/api";
import { requestError, type FormError } from "@/lib/formError";

/** Dialog form for creating a shop — Viloyat/Tuman cascade from the ported
 * Uzbekistan regions dataset instead of a free-text district field. */
export function StoreFormDialog({
  open,
  onOpenChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (msg: FormError) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [viloyat, setViloyat] = useState("");
  const [district, setDistrict] = useState("");
  const [tier, setTier] = useState<AdminPartnerTier>("standard");

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["regions"],
    queryFn: listRegions,
    staleTime: Infinity, // static reference data — never changes at runtime
  });
  const districtOptions = regions.find((r) => r.name === viloyat)?.districts ?? [];

  function reset() {
    setName("");
    setViloyat("");
    setDistrict("");
    setTier("standard");
  }

  const createMutation = useMutation({
    mutationFn: () => createAdminStore({ name, district: district || null, partner_tier: tier }),
    onSuccess: () => {
      reset();
      onError(null);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "stores"] });
    },
    onError: (err) => onError(requestError(err, "dokon.store.create_failed")),
  });

  return (
    <Dialog themed
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("dokon.store.new_title")}
      description={t("dokon.store.new_desc")}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
        className="space-y-4"
      >
        <Input themed
          label={t("dokon.admin.nomi")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("seller.shop_name")}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Select themed
            label={t("dokon.store.viloyat")}
            value={viloyat}
            onChange={(e) => {
              setViloyat(e.target.value);
              setDistrict(""); // previous tuman may not exist in the new viloyat
            }}
          >
            <option value="">{t("dokon.admin.not_selected")}</option>
            {regions.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </Select>
          <Select themed
            label={t("seller.district")}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!viloyat}
          >
            <option value="">{t("dokon.admin.not_selected")}</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </div>
        <Select themed label={t("dokon.store.tier")} value={tier} onChange={(e) => setTier(e.target.value as AdminPartnerTier)}>
          {ADMIN_PARTNER_TIERS.map((tier) => (
            <option key={tier} value={tier}>{tier}</option>
          ))}
        </Select>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
            {t("common.bekor")}
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={createMutation.isPending}>
            {t("common.qoshish")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
